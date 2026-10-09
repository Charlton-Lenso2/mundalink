// Express app factory: CORS, JSON, request-id, routes, 404, error handler.
// No secrets are logged or returned; no stack traces leak to clients.

import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { requestIdMiddleware, errorHandler } from "./middleware/error-handler";
import { healthHandler } from "./routes/health";
import { profileRouter } from "./routes/profile";
import { listingsRouter } from "./routes/listings";
import { offersRouter } from "./routes/offers";
import { dealsRouter } from "./routes/deals";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: env.clientUrl,
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(requestIdMiddleware);

  app.get("/api/health", healthHandler);
  app.use("/api/profile", profileRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/offers", offersRouter);
  app.use("/api/deals", dealsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NotFound", message: "Route not found" },
      timestamp: new Date().toISOString(),
    });
  });

  app.use(errorHandler);
  return app;
}
