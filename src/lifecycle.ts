/**
 * Graceful-shutdown lifecycle manager.
 *
 * Registers SIGINT / SIGTERM handlers that run every cleanup callback
 * exactly once, stop the HTTP server, and exit cleanly.
 */

type CleanupFn = () => void | Promise<void>;

interface Stoppable {
  stop(): void;
}

export function registerShutdownHooks(
  server: Stoppable,
  cleanups: CleanupFn[],
): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n🛑 Received ${signal} — shutting down…`);

    for (const fn of cleanups) {
      try {
        await fn();
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }

    try {
      server.stop();
    } catch (err) {
      console.error("Server stop error:", err);
    }

    console.log("👋 Goodbye");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
