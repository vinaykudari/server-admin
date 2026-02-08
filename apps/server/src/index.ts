import http from "node:http";
import path from "node:path";

import express from "express";

import logsRouter from "./routes/logs.js";
import sessionsRouter from "./routes/sessions.js";
import jobsRouter from "./routes/jobs.js";
import usageRouter from "./routes/usage.js";
import { clientDistPath } from "./utils/paths.js";

const app = express();
const port = Number(process.env.PORT ?? 4175);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", logsRouter);
app.use("/api", sessionsRouter);
app.use("/api", jobsRouter);
app.use("/api", usageRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use(express.static(clientDistPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Server admin app listening on port ${port}`);
});
