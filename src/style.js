// Palette condivisa con le altre app Podere Verde (Century Gothic, verde/terra)
export const C = {
  bg: "#F7F5F0",
  card: "#FFFFFF",
  border: "#E3DFD4",
  primary: "#3A5A40",     // verde scuro — azione, intestazioni
  primaryLight: "#5C7C63",
  accent: "#8B6F47",      // terra — accento secondario
  text: "#2B2B26",
  muted: "#7A756A",
  green: "#4A7C59",
  red: "#C0392B",
  yellow: "#D4A017",
  blue: "#2C6E9B",
  bovini: "#8B6F47",
  suini: "#B5657A",
  ovini: "#6B8E4E",
};

export const FONT = "'Century Gothic', 'Trebuchet MS', system-ui, sans-serif";

export const baseStyles = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${FONT}; background: ${C.bg}; color: ${C.text}; }
  button { font-family: ${FONT}; cursor: pointer; }
  input, select { font-family: ${FONT}; }
  table { border-collapse: collapse; width: 100%; }
`;
