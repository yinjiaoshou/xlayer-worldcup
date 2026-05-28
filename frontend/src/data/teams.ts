export interface Team {
  code: string;
  name: string;    // Chinese name
  nameEn: string;  // English name
  symbol: string;
  flag: string;
  group: string;
  confederation: "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC" | "OFC";
  // Populated after contract deployment
  tokenAddress?: string;
}

export const TEAMS: Team[] = [
  // ── Group A ──────────────────────────────────────────────────────
  { code: "USA", name: "美国",         nameEn: "United States",   symbol: "USA", flag: "🇺🇸", group: "A", confederation: "CONCACAF" },
  { code: "CAN", name: "加拿大",       nameEn: "Canada",          symbol: "CAN", flag: "🇨🇦", group: "A", confederation: "CONCACAF" },
  { code: "MEX", name: "墨西哥",       nameEn: "Mexico",          symbol: "MEX", flag: "🇲🇽", group: "A", confederation: "CONCACAF" },
  { code: "JAM", name: "牙买加",       nameEn: "Jamaica",         symbol: "JAM", flag: "🇯🇲", group: "A", confederation: "CONCACAF" },
  // ── Group B ──────────────────────────────────────────────────────
  { code: "GER", name: "德国",         nameEn: "Germany",         symbol: "GER", flag: "🇩🇪", group: "B", confederation: "UEFA" },
  { code: "SCO", name: "苏格兰",       nameEn: "Scotland",        symbol: "SCO", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", group: "B", confederation: "UEFA" },
  { code: "HUN", name: "匈牙利",       nameEn: "Hungary",         symbol: "HUN", flag: "🇭🇺", group: "B", confederation: "UEFA" },
  { code: "SUI", name: "瑞士",         nameEn: "Switzerland",     symbol: "SUI", flag: "🇨🇭", group: "B", confederation: "UEFA" },
  // ── Group C ──────────────────────────────────────────────────────
  { code: "ARG", name: "阿根廷",       nameEn: "Argentina",       symbol: "ARG", flag: "🇦🇷", group: "C", confederation: "CONMEBOL" },
  { code: "BRA", name: "巴西",         nameEn: "Brazil",          symbol: "BRA", flag: "🇧🇷", group: "C", confederation: "CONMEBOL" },
  { code: "CHI", name: "智利",         nameEn: "Chile",           symbol: "CHI", flag: "🇨🇱", group: "C", confederation: "CONMEBOL" },
  { code: "PER", name: "秘鲁",         nameEn: "Peru",            symbol: "PER", flag: "🇵🇪", group: "C", confederation: "CONMEBOL" },
  // ── Group D ──────────────────────────────────────────────────────
  { code: "FRA", name: "法国",         nameEn: "France",          symbol: "FRA", flag: "🇫🇷", group: "D", confederation: "UEFA" },
  { code: "AUT", name: "奥地利",       nameEn: "Austria",         symbol: "AUT", flag: "🇦🇹", group: "D", confederation: "UEFA" },
  { code: "POL", name: "波兰",         nameEn: "Poland",          symbol: "POL", flag: "🇵🇱", group: "D", confederation: "UEFA" },
  { code: "NED", name: "荷兰",         nameEn: "Netherlands",     symbol: "NED", flag: "🇳🇱", group: "D", confederation: "UEFA" },
  // ── Group E ──────────────────────────────────────────────────────
  { code: "ESP", name: "西班牙",       nameEn: "Spain",           symbol: "ESP", flag: "🇪🇸", group: "E", confederation: "UEFA" },
  { code: "CRO", name: "克罗地亚",     nameEn: "Croatia",         symbol: "CRO", flag: "🇭🇷", group: "E", confederation: "UEFA" },
  { code: "ITA", name: "意大利",       nameEn: "Italy",           symbol: "ITA", flag: "🇮🇹", group: "E", confederation: "UEFA" },
  { code: "ALB", name: "阿尔巴尼亚",   nameEn: "Albania",         symbol: "ALB", flag: "🇦🇱", group: "E", confederation: "UEFA" },
  // ── Group F ──────────────────────────────────────────────────────
  { code: "MAR", name: "摩洛哥",       nameEn: "Morocco",         symbol: "MAR", flag: "🇲🇦", group: "F", confederation: "CAF" },
  { code: "SEN", name: "塞内加尔",     nameEn: "Senegal",         symbol: "SEN", flag: "🇸🇳", group: "F", confederation: "CAF" },
  { code: "RSA", name: "南非",         nameEn: "South Africa",    symbol: "RSA", flag: "🇿🇦", group: "F", confederation: "CAF" },
  { code: "NGA", name: "尼日利亚",     nameEn: "Nigeria",         symbol: "NGA", flag: "🇳🇬", group: "F", confederation: "CAF" },
  // ── Group G ──────────────────────────────────────────────────────
  { code: "ENG", name: "英格兰",       nameEn: "England",         symbol: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", group: "G", confederation: "UEFA" },
  { code: "SRB", name: "塞尔维亚",     nameEn: "Serbia",          symbol: "SRB", flag: "🇷🇸", group: "G", confederation: "UEFA" },
  { code: "DEN", name: "丹麦",         nameEn: "Denmark",         symbol: "DEN", flag: "🇩🇰", group: "G", confederation: "UEFA" },
  { code: "SVN", name: "斯洛文尼亚",   nameEn: "Slovenia",        symbol: "SVN", flag: "🇸🇮", group: "G", confederation: "UEFA" },
  // ── Group H ──────────────────────────────────────────────────────
  { code: "POR", name: "葡萄牙",       nameEn: "Portugal",        symbol: "POR", flag: "🇵🇹", group: "H", confederation: "UEFA" },
  { code: "TUR", name: "土耳其",       nameEn: "Turkey",          symbol: "TUR", flag: "🇹🇷", group: "H", confederation: "UEFA" },
  { code: "BEL", name: "比利时",       nameEn: "Belgium",         symbol: "BEL", flag: "🇧🇪", group: "H", confederation: "UEFA" },
  { code: "CZE", name: "捷克",         nameEn: "Czech Republic",  symbol: "CZE", flag: "🇨🇿", group: "H", confederation: "UEFA" },
  // ── Group I ──────────────────────────────────────────────────────
  { code: "JPN", name: "日本",         nameEn: "Japan",           symbol: "JPN", flag: "🇯🇵", group: "I", confederation: "AFC" },
  { code: "KOR", name: "韩国",         nameEn: "South Korea",     symbol: "KOR", flag: "🇰🇷", group: "I", confederation: "AFC" },
  { code: "AUS", name: "澳大利亚",     nameEn: "Australia",       symbol: "AUS", flag: "🇦🇺", group: "I", confederation: "AFC" },
  { code: "IDN", name: "印度尼西亚",   nameEn: "Indonesia",       symbol: "IDN", flag: "🇮🇩", group: "I", confederation: "AFC" },
  // ── Group J ──────────────────────────────────────────────────────
  { code: "URU", name: "乌拉圭",       nameEn: "Uruguay",         symbol: "URU", flag: "🇺🇾", group: "J", confederation: "CONMEBOL" },
  { code: "COL", name: "哥伦比亚",     nameEn: "Colombia",        symbol: "COL", flag: "🇨🇴", group: "J", confederation: "CONMEBOL" },
  { code: "ECU", name: "厄瓜多尔",     nameEn: "Ecuador",         symbol: "ECU", flag: "🇪🇨", group: "J", confederation: "CONMEBOL" },
  { code: "VEN", name: "委内瑞拉",     nameEn: "Venezuela",       symbol: "VEN", flag: "🇻🇪", group: "J", confederation: "CONMEBOL" },
  // ── Group K ──────────────────────────────────────────────────────
  { code: "EGY", name: "埃及",         nameEn: "Egypt",           symbol: "EGY", flag: "🇪🇬", group: "K", confederation: "CAF" },
  { code: "CMR", name: "喀麦隆",       nameEn: "Cameroon",        symbol: "CMR", flag: "🇨🇲", group: "K", confederation: "CAF" },
  { code: "GHA", name: "加纳",         nameEn: "Ghana",           symbol: "GHA", flag: "🇬🇭", group: "K", confederation: "CAF" },
  { code: "TUN", name: "突尼斯",       nameEn: "Tunisia",         symbol: "TUN", flag: "🇹🇳", group: "K", confederation: "CAF" },
  // ── Group L ──────────────────────────────────────────────────────
  { code: "IRN", name: "伊朗",         nameEn: "Iran",            symbol: "IRN", flag: "🇮🇷", group: "L", confederation: "AFC" },
  { code: "KSA", name: "沙特阿拉伯",   nameEn: "Saudi Arabia",    symbol: "KSA", flag: "🇸🇦", group: "L", confederation: "AFC" },
  { code: "UZB", name: "乌兹别克斯坦", nameEn: "Uzbekistan",      symbol: "UZB", flag: "🇺🇿", group: "L", confederation: "AFC" },
  { code: "NZL", name: "新西兰",       nameEn: "New Zealand",     symbol: "NZL", flag: "🇳🇿", group: "L", confederation: "OFC" },
];

export const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function getTeamsByGroup(group: string): Team[] {
  return TEAMS.filter((t) => t.group === group);
}

export function getTeamByCode(code: string): Team | undefined {
  return TEAMS.find((t) => t.code === code);
}

// Odds multipliers — purely cosmetic for UI display before on-chain data is available
export const ODDS: Record<string, number> = {
  ARG: 4.5, FRA: 5.0, ENG: 6.0, BRA: 5.5, ESP: 6.5, GER: 7.0,
  POR: 8.0, NED: 10.0, URU: 14.0, BEL: 12.0, USA: 16.0, MAR: 18.0,
};
