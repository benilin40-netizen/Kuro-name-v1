import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  targetTimestamp: number; // Unix timestamp in seconds or ms
  variant?: 'inline' | 'compact' | 'blocks' | 'featured' | 'hero';
  onExpire?: () => void;
  className?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
}

function calculateTimeRemaining(targetTimestamp: number): TimeRemaining {
  const targetMs = targetTimestamp < 10000000000 ? targetTimestamp * 1000 : targetTimestamp;
  const diffMs = targetMs - Date.now();

  if (diffMs <= 0 || isNaN(diffMs)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, isExpired: false, totalSeconds };
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  targetTimestamp,
  variant = 'compact',
  onExpire,
  className = '',
}) => {
  const [time, setTime] = useState<TimeRemaining>(() => calculateTimeRemaining(targetTimestamp));

  useEffect(() => {
    const initial = calculateTimeRemaining(targetTimestamp);
    setTime(initial);
    if (initial.isExpired) {
      onExpire?.();
      return;
    }

    const timer = setInterval(() => {
      const remaining = calculateTimeRemaining(targetTimestamp);
      setTime(remaining);

      if (remaining.isExpired) {
        clearInterval(timer);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTimestamp, onExpire]);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (time.isExpired) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl ${className}`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </span>
        BROADCASTING LIVE NOW
      </span>
    );
  }

  if (variant === 'featured' || variant === 'hero') {
    return (
      <div className={`grid grid-cols-4 gap-2.5 sm:gap-4 text-center ${className}`}>
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#060812] border border-amber-500/30 p-2.5 sm:p-4 shadow-inner shadow-amber-500/5">
          <span className="mono-number text-2xl sm:text-4xl font-extrabold text-amber-400 tracking-tight">{pad(time.days)}</span>
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">DAYS</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#060812] border border-amber-500/30 p-2.5 sm:p-4 shadow-inner shadow-amber-500/5">
          <span className="mono-number text-2xl sm:text-4xl font-extrabold text-amber-400 tracking-tight">{pad(time.hours)}</span>
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">HOURS</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#060812] border border-amber-500/30 p-2.5 sm:p-4 shadow-inner shadow-amber-500/5">
          <span className="mono-number text-2xl sm:text-4xl font-extrabold text-amber-400 tracking-tight">{pad(time.minutes)}</span>
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">MINS</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#060812] border border-amber-500/40 p-2.5 sm:p-4 shadow-inner shadow-amber-500/10">
          <span className="mono-number text-2xl sm:text-4xl font-extrabold text-amber-300 animate-pulse tracking-tight">{pad(time.seconds)}</span>
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-amber-400 mt-1">SECS</span>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`mono-number font-bold tracking-tight text-amber-400 ${className}`}>
        {time.days > 0 && `${time.days}d `}
        {pad(time.hours)}h {pad(time.minutes)}m {pad(time.seconds)}s
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-1 text-xs mono-number font-bold text-slate-200 ${className}`}>
        <span className="text-amber-400">{time.days > 0 ? `${pad(time.days)}d ` : ''}</span>
        <span>{pad(time.hours)}h</span>
        <span className="text-slate-600">:</span>
        <span>{pad(time.minutes)}m</span>
        <span className="text-slate-600">:</span>
        <span className="text-amber-400">{pad(time.seconds)}s</span>
      </div>
    );
  }

  // variant === 'blocks'
  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${className}`}>
      <div className="flex flex-col items-center justify-center rounded-xl bg-[#060812] border border-white/10 px-2 py-1 min-w-[42px] sm:min-w-[48px]">
        <span className="mono-number text-xs sm:text-sm font-bold text-white">{pad(time.days)}</span>
        <span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-wider text-slate-400">DAYS</span>
      </div>
      <span className="text-slate-600 font-bold text-xs">:</span>
      <div className="flex flex-col items-center justify-center rounded-xl bg-[#060812] border border-white/10 px-2 py-1 min-w-[42px] sm:min-w-[48px]">
        <span className="mono-number text-xs sm:text-sm font-bold text-white">{pad(time.hours)}</span>
        <span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-wider text-slate-400">HOURS</span>
      </div>
      <span className="text-slate-600 font-bold text-xs">:</span>
      <div className="flex flex-col items-center justify-center rounded-xl bg-[#060812] border border-white/10 px-2 py-1 min-w-[42px] sm:min-w-[48px]">
        <span className="mono-number text-xs sm:text-sm font-bold text-white">{pad(time.minutes)}</span>
        <span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-wider text-slate-400">MINS</span>
      </div>
      <span className="text-slate-600 font-bold text-xs">:</span>
      <div className="flex flex-col items-center justify-center rounded-xl bg-[#060812] border border-amber-500/30 px-2 py-1 min-w-[42px] sm:min-w-[48px] bg-amber-500/5">
        <span className="mono-number text-xs sm:text-sm font-bold text-amber-400">{pad(time.seconds)}</span>
        <span className="text-[8px] sm:text-[9px] uppercase font-bold tracking-wider text-amber-400">SECS</span>
      </div>
    </div>
  );
};

export function formatAiringDate(timestamp: number): string {
  const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
