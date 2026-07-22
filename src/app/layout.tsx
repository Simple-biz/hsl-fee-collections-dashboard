import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { auth } from "@/auth";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Collections Dashboard",
  description: "Collections management for Hogan Smith Law",
};

const RootLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  // Hydrate SessionProvider with the server-known session so the sidebar
  // shows the real user on the first paint after login, without needing a
  // manual refresh. Without this prop, SessionProvider starts as null and
  // only fetches /api/auth/session on mount — and since it lives in this
  // persistent root layout, it doesn't remount on the post-login navigation,
  // so it would stay stale until a full page reload.
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} font-sans min-h-svh antialiased`}>
        <SessionProvider session={session}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
};

export default RootLayout;
