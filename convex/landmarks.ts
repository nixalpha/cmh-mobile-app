import { v } from "convex/values";

import { query } from "./_generated/server";
import { destinationValidator, landmarkValidator, toDestination, toLandmark } from "./destinations";
import { requireUser } from "./lib/auth";
import { fold } from "./lib/text";

export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.object({ landmark: landmarkValidator, destination: destinationValidator })),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const text = fold(args.query);
    if (text.length === 0) return [];
    const matches = await ctx.db
      .query("landmarks")
      .withSearchIndex("search_searchText", (q) => q.search("searchText", text).eq("status", "active"))
      .take(40);
    matches.sort((a, b) => b.notability - a.notability);
    const results = [];
    for (const landmark of matches.slice(0, Math.max(1, Math.min(args.limit ?? 10, 20)))) {
      const destination = await ctx.db.get("destinations", landmark.destinationId);
      if (destination === null) continue;
      results.push({ landmark: toLandmark(landmark), destination: toDestination(destination) });
    }
    return results;
  },
});
