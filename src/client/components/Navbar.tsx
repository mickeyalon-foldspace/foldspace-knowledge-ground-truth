"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/golden-sets", label: "Golden Sets" },
  { href: "/runs", label: "Evaluation Runs" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, organization, signOut } = useAuth();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="text-lg font-bold text-gray-900 tracking-tight"
            >
              Ground Truth
            </Link>
            <div className="flex gap-1">
              {navLinks.map((link) => {
                const isActive =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {organization && (
              <span className="text-xs text-gray-400">
                {organization.name}
              </span>
            )}
            {user?.role === "admin" && (
              <Link
                href="/settings"
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  pathname === "/settings"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                Settings
              </Link>
            )}
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 hidden sm:inline">
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
