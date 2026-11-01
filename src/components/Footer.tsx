import React from 'react';
import { Waves, Shield, Mail } from 'lucide-react';

interface FooterProps {
  onNavigate: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="mt-16 border-t border-white/5 bg-[#050608] text-slate-400 text-xs">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Column 1: Brand & Identity */}
          <div className="space-y-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-white">
                KURO <span className="text-rose-500">NAMI</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              KURO NAMI is a fast, dark, and modern anime discovery platform.
              Powered by real-time AniList GraphQL data and broadcast countdown synchronization.
            </p>
          </div>

          {/* Column 2: Navigation */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-2.5">Discovery</h4>
            <ul className="space-y-1.5">
              {['Home', 'Anime', 'Airing', 'Schedule', 'Countdown', 'News', 'Genres', 'Rankings'].map((item) => (
                <li key={item}>
                  <button
                    onClick={() => onNavigate(item.toLowerCase())}
                    className="hover:text-rose-400 transition-colors"
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Legal & Compliance */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-2.5">Compliance & DMCA</h4>
            <div className="space-y-1.5 text-xs text-slate-400">
              <p>
                KURO NAMI does not host copyrighted anime videos. Metadata and imagery are indexed dynamically via official public APIs.
              </p>
              <div className="flex items-center gap-1 text-slate-300">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Legally Authorized Sources Only</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 pt-1">
                <Mail className="w-3.5 h-3.5 text-rose-400" />
                <span>compliance@kuronami.com</span>
              </div>
            </div>
          </div>

          {/* Column 4: Data Sources */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-2.5">Metadata Index</h4>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <span>AniList GraphQL API</span>
                <span className="text-emerald-400 text-[10px] font-semibold">Live Primary</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <span>Broadcast Timestamps</span>
                <span className="text-rose-400 text-[10px] font-semibold">UTC Real-Time</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <div>
            © {new Date().getFullYear()} KURO NAMI. All rights reserved. Anime titles and imagery are copyright of their respective production committees.
          </div>
          <div>
            Dark · Fast · Anime-Focused
          </div>
        </div>
      </div>
    </footer>
  );
};
