export const themeClasses = (dark: boolean) => {
  return {
    bg: dark ? "bg-neutral-950" : "bg-white",
    bgSub: dark ? "bg-neutral-900" : "bg-neutral-50/50",
    border: dark ? "border-neutral-800" : "border-neutral-200",
    borderLight: dark ? "border-neutral-800/50" : "border-neutral-100",
    text: dark ? "text-neutral-100" : "text-neutral-900",
    textSub: dark ? "text-neutral-400" : "text-neutral-500",
    textMuted: dark ? "text-neutral-500" : "text-neutral-400",
    card: dark
      ? "bg-neutral-900 border-neutral-800"
      : "bg-white border-neutral-200",
    hover: dark ? "hover:bg-neutral-800" : "hover:bg-neutral-50",
    inputBg: dark
      ? "bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500"
      : "bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400",
    activeNav: dark
      ? "bg-neutral-800 text-neutral-100"
      : "bg-neutral-100 text-neutral-900",
    avatarBg: dark
      ? "bg-neutral-800 text-neutral-300"
      : "bg-neutral-200 text-neutral-600",
    logoBg: dark ? "bg-white" : "bg-neutral-900",
    logoIcon: dark ? "text-neutral-900" : "text-white",
    pillBg: dark
      ? "bg-neutral-800 text-neutral-300"
      : "bg-neutral-100 text-neutral-600",
    searchBox: dark
      ? "bg-neutral-800 border-neutral-700 text-neutral-500"
      : "bg-neutral-50 border-neutral-100 text-neutral-400",
    kbdBg: dark
      ? "bg-neutral-700 border-neutral-600"
      : "bg-white border-neutral-200",
    ctaBtn: dark
      ? "bg-white text-neutral-900 hover:bg-neutral-200"
      : "bg-neutral-900 text-white hover:bg-neutral-800",
    outlineBtn: dark
      ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
  };
};
