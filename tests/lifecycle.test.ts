/**
 * Unit tests for the graceful-shutdown lifecycle module.
 *
 * We override `process.exit` to prevent the test runner from dying,
 * then manually emit SIGINT / SIGTERM to exercise the shutdown path.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { registerShutdownHooks } from "../src/lifecycle";

// ── Helpers ──────────────────────────────────────────────────────

function makeFakeServer() {
  const stopFn = mock(() => {});
  return { stop: stopFn };
}

// ── Tests ────────────────────────────────────────────────────────

describe("registerShutdownHooks", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    // Prevent the test runner from actually exiting
    // @ts-expect-error — intentionally replacing process.exit
    process.exit = mock(() => {});
  });

  afterEach(() => {
    process.exit = originalExit;
    // Remove listeners we installed so they don't leak between tests
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("invokes all cleanup callbacks and stops the server on SIGINT", async () => {
    const server = makeFakeServer();
    const cleanup1 = mock(() => {});
    const cleanup2 = mock(() => {});

    registerShutdownHooks(server, [cleanup1, cleanup2]);
    process.emit("SIGINT");
    await Bun.sleep(10);

    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(cleanup2).toHaveBeenCalledTimes(1);
    expect(server.stop).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("invokes all cleanup callbacks and stops the server on SIGTERM", async () => {
    const server = makeFakeServer();
    const cleanup1 = mock(() => {});

    registerShutdownHooks(server, [cleanup1]);
    process.emit("SIGTERM");
    await Bun.sleep(10);

    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(server.stop).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("is idempotent — second signal does not re-invoke cleanups", async () => {
    const server = makeFakeServer();
    const cleanup = mock(() => {});

    registerShutdownHooks(server, [cleanup]);

    process.emit("SIGINT");
    // Allow micro-task queue to flush (shutdown is async)
    await Bun.sleep(10);
    process.emit("SIGINT");
    await Bun.sleep(10);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(server.stop).toHaveBeenCalledTimes(1);
  });

  it("continues shutdown even if a cleanup callback throws", async () => {
    const server = makeFakeServer();
    const failing = mock(() => {
      throw new Error("boom");
    });
    const passing = mock(() => {});

    registerShutdownHooks(server, [failing, passing]);
    process.emit("SIGINT");
    await Bun.sleep(10);

    // Both called despite first throwing
    expect(failing).toHaveBeenCalledTimes(1);
    expect(passing).toHaveBeenCalledTimes(1);
    expect(server.stop).toHaveBeenCalledTimes(1);
  });
});
