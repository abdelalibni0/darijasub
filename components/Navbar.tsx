"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/20 border-b border-white/10">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1 text-xl font-black">
          <span className="text-purple-400">Darija</span>
          <span className="text-white">Sub</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>

        {/* Auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login" className="text-sm text-white/60 hover:text-white transition-colors px-4 py-2">
            Log in
          </Link>
          <Link href="/auth/signup" className="btn-primary text-sm py-2 px-5">
            Get started
          </Link>
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden text-white/60 hover:text-white"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-black/40 backdrop-blur-md px-6 py-4 flex flex-col gap-4 text-sm">
          <a href="#features" className="text-white/60 hover:text-white transition-colors" onClick={() => setOpen(false)}>Features</a>
          <a href="#how-it-works" className="text-white/60 hover:text-white transition-colors" onClick={() => setOpen(false)}>How it works</a>
          <a href="#pricing" className="text-white/60 hover:text-white transition-colors" onClick={() => setOpen(false)}>Pricing</a>
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <Link href="/auth/login" className="text-white/60 hover:text-white transition-colors py-1">Log in</Link>
            <Link href="/auth/signup" className="btn-primary text-center text-sm py-2">Get started</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
