import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { auth } from "@/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AppRescue — Deploy Your App in Minutes",
  description:
    "Upload a ZIP, detect your framework, and deploy to Vercel instantly.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-900 text-slate-100">
        {/* Nav */}
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-white hover:text-blue-400 transition-colors"
            >
              <svg
                className="h-5 w-5 text-blue-500"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              AppRescue
            </Link>

            <nav className="flex items-center gap-4">
              {session?.user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Dashboard
                  </Link>
                  <div className="flex items-center gap-2">
                    {session.user.image && (
                      <img
                        src={session.user.image}
                        alt={session.user.name ?? "User"}
                        className="h-7 w-7 rounded-full"
                      />
                    )}
                    <span className="text-sm text-slate-400">
                      {session.user.name ?? session.user.email}
                    </span>
                  </div>
                  <Link
                    href="/api/auth/signout"
                    className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Sign out
                  </Link>
                </>
              ) : (
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-800 py-6 text-center">
          <p className="text-xs text-slate-600">
            AppRescue — Deploy any web project in minutes
          </p>
        </footer>
      </body>
    </html>
  );
}
