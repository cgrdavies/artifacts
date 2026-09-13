import { createApp } from "./app";
import { deleteOldArtifacts } from "./db";

const PORT = parseInt(process.env.PORT || "3000", 10);
deleteOldArtifacts.run();
const cleanup = setInterval(() => {
  const result = deleteOldArtifacts.run();
  if (result.changes > 0) console.log(`Removed ${result.changes} old artifact(s).`);
}, 60 * 60 * 1000);
cleanup.unref();
createApp().listen(PORT, "0.0.0.0", () => console.log(`Artifacts server running on port ${PORT}`));
