import type { SVGProps } from "react";
import { createElement } from "react";

type IconNode = [string, string | Record<string, number>];

const P = {
  folder:[["path","M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"]],
  calendar:[["rect",{x:3,y:4,width:18,height:18,rx:2}],["path","M8 2v4"],["path","M16 2v4"],["path","M3 10h18"]],
  clipboard:[["path","M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"],["rect",{x:8,y:2,width:8,height:4,rx:1}],["path","M8 11h8"],["path","M8 15h5"]],
  droplet:[["path","M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"]],
  package:[["path","M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"],["path","m3.3 7 8.7 5 8.7-5"],["path","M12 22V12"]],
  trending:[["path","M16 7h6v6"],["path","m22 7-8.5 8.5-5-5L2 17"]],
  fileText:[["path","M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"],["path","M14 2v4a2 2 0 0 0 2 2h4"],["path","M16 13H8"],["path","M16 17H8"]],
  card:[["rect",{x:2,y:5,width:20,height:14,rx:2}],["path","M2 10h20"]],
  message:[["path","M22 17a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"]],
  book:[["path","M12 7v14"],["path","M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"]],
  archive:[["rect",{x:2,y:4,width:20,height:5,rx:1}],["path","M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"],["path","M10 13h4"]],
  sliders:[["path","M21 4h-7"],["path","M10 4H3"],["path","M21 12h-9"],["path","M8 12H3"],["path","M21 20h-5"],["path","M12 20H3"],["circle",{cx:12,cy:4,r:2}],["circle",{cx:10,cy:12,r:2}],["circle",{cx:14,cy:20,r:2}]],
  search:[["path","m21 21-4.34-4.34"],["circle",{cx:11,cy:11,r:8}]],
  plus:[["path","M5 12h14"],["path","M12 5v14"]],
  grid:[["rect",{x:3,y:3,width:7,height:7,rx:1}],["rect",{x:14,y:3,width:7,height:7,rx:1}],["rect",{x:14,y:14,width:7,height:7,rx:1}],["rect",{x:3,y:14,width:7,height:7,rx:1}]],
  list:[["path","M3 6h.01"],["path","M8 6h13"],["path","M3 12h.01"],["path","M8 12h13"],["path","M3 18h.01"],["path","M8 18h13"]],
  bell:[["path","M10.268 21a2 2 0 0 0 3.464 0"],["path","M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"]],
  sun:[["circle",{cx:12,cy:12,r:4}],["path","M12 2v2"],["path","M12 20v2"],["path","m4.93 4.93 1.41 1.41"],["path","m17.66 17.66 1.41 1.41"],["path","M2 12h2"],["path","M20 12h2"],["path","m6.34 17.66-1.41 1.41"],["path","m19.07 4.93-1.41 1.41"]],
  moon:[["path","M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9"]],
  chevronDown:[["path","m6 9 6 6 6-6"]],
  chevronRight:[["path","m9 18 6-6-6-6"]],
  filter:[["path","M3 6h18"],["path","M7 12h10"],["path","M10 18h4"]],
  alert:[["path","m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"],["path","M12 9v4"],["path","M12 17h.01"]],
  menu:[["path","M4 6h16"],["path","M4 12h16"],["path","M4 18h16"]],
  scan:[["path","M3 7V5a2 2 0 0 1 2-2h2"],["path","M17 3h2a2 2 0 0 1 2 2v2"],["path","M21 17v2a2 2 0 0 1-2 2h-2"],["path","M7 21H5a2 2 0 0 1-2-2v-2"],["path","M7 12h10"]],
  users:[["path","M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"],["circle",{cx:9,cy:7,r:4}],["path","M22 21v-2a4 4 0 0 0-3-3.87"]],
} satisfies Record<string, IconNode[]>;

export type DesignIconName = keyof typeof P;

export function DesignIcon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: DesignIconName; size?: number }) {
  const children = (P[name] as IconNode[]).map(([tag, value], index) =>
    typeof value === "string"
      ? createElement("path", { key: index, d: value })
      : createElement(tag, { key: index, ...value }),
  );
  return createElement(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, ...props },
    children,
  );
}
