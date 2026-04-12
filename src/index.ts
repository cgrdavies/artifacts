import express from "express";
import { deleteOldArtifacts } from "./db";
import routes from "./routes";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.json({ limit: "12mb" }));
app.use(routes);

// Cleanup artifacts older than 30 days — run every hour
setInterval(() => {
  const result = deleteOldArtifacts.run();
  if (result.changes > 0) {
    console.log(`Cleaned up ${result.changes} expired artifact(s)`);
  }
}, 60 * 60 * 1000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Artifacts server running on port ${PORT}`);
});
