import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("clean orphan photo uploads", { hours: 24 }, internal.landmarkVisits.cleanOrphanUploads, { cursor: null });

export default crons;
