import type { InventoryCategory } from "@/lib/types";

type Rule = { category: InventoryCategory; pattern: RegExp };

// Ordered from specific to broad. This is intentionally deterministic: every
// import can be re-run without an AI service changing yesterday's categories.
const RULES: Rule[] = [
  { category: "safety", pattern: /\b(life ?jacket|pfd|flare|fire exting|first aid|epirb|safety|horn)\b/i },
  { category: "electronics", pattern: /\b(transducer|sonar|radar|gps|chartplotter|vhf|ais|nmea|fish ?finder|antenna|lowrance|simrad|garmin)\b/i },
  { category: "steering", pattern: /\b(steer|helm|control cable|throttle|shift cable|trim tab|hydraulic cylinder)\b/i },
  { category: "plumbing", pattern: /\b(pump|bilge|hose|valve|fitting|seacock|toilet|head|water tank|plumbing|impeller)\b/i },
  { category: "engine", pattern: /\b(engine|outboard|inboard|mercury|yamaha|volvo penta|spark plug|fuel filter|oil filter|gasket|carburetor|starter|alternator|propeller|anode)\b/i },
  { category: "electrical", pattern: /\b(wire|cable|battery|switch|breaker|fuse|relay|connector|terminal|bus ?bar|charger|inverter|led|light)\b/i },
  { category: "paint", pattern: /\b(paint|primer|epoxy|resin|hardener|antifouling|coat|thinner|solvent|varnish)\b/i },
  { category: "fastener", pattern: /\b(bolt|screw|nut|washer|rivet|fastener|threaded rod|cotter pin)\b/i },
  { category: "deck", pattern: /\b(cleat|anchor|windlass|chain|shackle|deck|hatch|rail|stanchion|winch|rope|line|fender)\b/i },
  { category: "dock", pattern: /\b(dock|mooring|bumper|float|pile|gangway)\b/i },
  { category: "aluminum", pattern: /\b(aluminum|aluminium|alloy plate|alloy sheet|alloy angle)\b/i },
  { category: "steel", pattern: /\b(stainless|steel|mild steel|galvanized|metal plate|metal sheet)\b/i },
  { category: "consumable", pattern: /\b(tape|sealant|adhesive|glue|cleaner|lubricant|grease|rag|sandpaper|abrasive)\b/i },
  { category: "mechanical", pattern: /\b(bearing|seal|shaft|coupling|gear|pulley|belt|spring|bracket)\b/i },
];

export function classifyInventoryItem(...values: Array<string | null | undefined>): InventoryCategory {
  const haystack = values.filter(Boolean).join(" ");
  return RULES.find((rule) => rule.pattern.test(haystack))?.category ?? "part";
}

