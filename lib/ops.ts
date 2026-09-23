/**
 * Whether a screen may talk about the machinery.
 *
 * "Start the worker with npm run worker:dev" is the right sentence for the
 * person running this on a laptop and a meaningless one for a customer, who
 * has no worker to start. Screens that wait on background work say the
 * operator's sentence only in development and the person's sentence always.
 * Inlined at build time, so it is safe in client components.
 */
export const SHOW_OPERATOR_HINTS = process.env.NODE_ENV === "development";

/** The command that starts background work locally. */
export const WORKER_COMMAND = "npm run worker:dev";
