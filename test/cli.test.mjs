import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const cli = resolve('artifacts-cli');

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [cli, ...args], { env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('CLI posts supported formats and handles failures without live service calls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'artifacts-cli-test-'));
  const temps = join(directory, 'temps');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(temps);
  const requests = [];
  let responseStatus = 201, responseBody, disconnect = false;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, path: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks)) });
    if (disconnect) { req.socket.destroy(); return; }
    res.writeHead(responseStatus, { 'Content-Type': 'application/json' });
    res.end(responseBody);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/a/test-id`;
  const env = { ARTIFACTS_URL: base, TMPDIR: temps };
  responseBody = JSON.stringify({ url });
  const invoke = args => run(['create', ...args], env);
  const success = result => {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, `${url}\n`);
    assert.equal(result.stderr, '');
  };
  const failure = (result, pattern) => {
    assert.notEqual(result.code, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
    assert.doesNotMatch(result.stderr, /parse error|unbound variable/);
  };
  try {
    for (const type of ['markdown', 'markdoc', 'html']) {
      const content = `# Hello 世界 🌍\n${type}\n\n`;
      success(await invoke(['--type', type, '--content', content]));
      assert.deepEqual(requests.at(-1).body, { type, content, ...(type === 'html' ? { contentType: 'text/html' } : {}) });
      const path = join(directory, `${type}.txt`);
      await writeFile(path, content);
      success(await invoke(['--type', type, '--file', path]));
      assert.equal(requests.at(-1).body.content, content);
    }
    const large = 'Unicode 🌍\n'.repeat(40000);
    const largePath = join(directory, 'large.md');
    await writeFile(largePath, large);
    success(await invoke(['--type', 'markdown', '--file', largePath]));
    assert.equal(requests.at(-1).body.content, large);
    const bytes = Buffer.from(Array.from({ length: 300000 }, (_, i) => i % 256));
    const rawPath = join(directory, 'binary.bin');
    await writeFile(rawPath, bytes);
    success(await invoke(['--type', 'raw', '--file', rawPath]));
    const raw = requests.at(-1).body;
    assert.equal(raw.type, 'raw');
    assert.equal(raw.filename, 'binary.bin');
    assert.equal(raw.contentType, execFileSync('file', ['--mime-type', '-b', rawPath], { encoding: 'utf8' }).trim());
    assert.deepEqual(Buffer.from(raw.content, 'base64'), bytes);
    for (const request of requests) {
      assert.equal(request.method, 'POST');
      assert.equal(request.path, '/api/artifacts');
      assert.equal(request.headers['content-type'], 'application/json');
    }
    const before = requests.length;
    for (const args of [[], ['--type'], ['--type', '--file'], ['--type', 'bad', '--content', 'x'], ['--type', 'markdown'], ['--type', 'markdown', '--content', ''], ['--type', 'raw', '--content', 'x'], ['--type', 'markdown', '--file', '/does/not/exist'], ['--type', 'markdown', '--file', directory], ['--type', 'html', '--content', 'x', '--file', rawPath], ['--type', 'markdown', '--file'], ['--unknown']]) {
      failure(await invoke(args), /Error:/);
    }
    const oversized = join(directory, 'oversized');
    await writeFile(oversized, Buffer.alloc(10485761));
    failure(await invoke(['--type', 'raw', '--file', oversized]), /10 MiB/);
    const invalidText = join(directory, 'invalid-utf8');
    await writeFile(invalidText, Buffer.from([0xff, 0xfe, 0x41]));
    failure(await invoke(['--type', 'markdown', '--file', invalidText]), /UTF-8/);
    assert.equal(requests.length, before);
    for (const status of [404, 413, 500]) {
      responseStatus = status;
      responseBody = '404 page not found';
      failure(await invoke(['--type', 'markdown', '--content', 'x']), new RegExp(`HTTP ${status}`));
    }
    responseStatus = 201;
    for (const body of ['not JSON', '{}', JSON.stringify({ url: 'https://evil.example/a/id' }), JSON.stringify({ url: `${base}.evil.example/a/id` }), JSON.stringify({ url: `${base}/a/id\nextra` }), JSON.stringify({ url: `${base}/a/id\\evil` }), JSON.stringify({ url: 1 }), `${JSON.stringify({ url })}\n${JSON.stringify({ url })}`]) {
      responseBody = body;
      failure(await invoke(['--type', 'markdown', '--content', 'x']), /invalid response|unexpected URL/);
    }
    disconnect = true;
    const beforeDisconnect = requests.length;
    failure(await invoke(['--type', 'markdown', '--content', 'x']), /may have been created.*Check before trying again/);
    assert.equal(requests.length, beforeDisconnect + 1, 'POST must not be retried');
    assert.deepEqual(await readdir(temps), [], 'temporary files must be cleaned up');

    // Inspect curl's actual arguments without making a network request.
    const bin = join(directory, 'bin');
    await mkdir(bin);
    const argumentLog = join(directory, 'curl-args');
    await writeFile(join(bin, 'curl'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "$CURL_ARGUMENT_LOG"\nexit 1\n`, { mode: 0o755 });
    failure(await run(['create', '--type', 'markdown', '--content', 'x'], { ...env, PATH: `${bin}:${process.env.PATH}`, CURL_ARGUMENT_LOG: argumentLog }), /may have been created/);
    const args = (await readFile(argumentLog, 'utf8')).trim().split('\n');
    assert.equal(args[args.indexOf('--connect-timeout') + 1], '10');
    assert.equal(args[args.indexOf('--max-time') + 1], '45');
    assert.match(args[args.indexOf('--data-binary') + 1], /^@.*\/request$/);
    assert.ok(!args.includes('--retry'));
    assert.deepEqual(await readdir(temps), []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
