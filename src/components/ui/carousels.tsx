"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-full",
  {
    variants: {
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
        default: "h-10 w-10",
        lg: "h-12 w-12",
        xl: "h-16 w-16",
        "2xl": "h-20 w-20",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  alt?: string;
  fallback?: string;
  status?: "online" | "offline" | "away" | "busy";
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size, src, alt, fallback, status, ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false);

    const getInitials = (name: string) => {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    };

    const statusColors = {
      online: "bg-success-500",
      offline: "bg-neutral-400",
      away: "bg-warning-500",
      busy: "bg-error-500",
    };

    return (
      <div
        ref={ref}
        className={cn(avatarVariants({ size }), className)}
        {...props}
      >
        {src && !imageError ? (
          <Image
            src={src}
            alt={alt || "Avatar"}
            className="aspect-square h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-primary-400 to-secondary-500 text-white font-black">
            {fallback ? getInitials(fallback) : "U"}
          </div>
        )}
        {status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white",
              statusColors[status]
            )}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

export { Avatar, avatarVariants };

// ==========================================
// PREMIUM COMPANY CAROUSEL
// ==========================================

export interface CarouselCompany {
  id: number;
  name: string;
  logo_url: string | null;
  url: string;
  users: number;
}

interface CompanyCarouselProps {
  items: CarouselCompany[];
  title?: string;
  usersLabel?: string;
}

export function CompanyCarousel({ items, title, usersLabel = "users" }: CompanyCarouselProps) {
  const [visibleItems, setVisibleItems] = React.useState(4.5);
  const isLoopable = items.length > visibleItems;

  const [activeIndex, setActiveIndex] = React.useState(isLoopable ? items.length : 0);
  const [transitionEnabled, setTransitionEnabled] = React.useState(true);
  const [isPaused, setIsPaused] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) setVisibleItems(1.5);
      else if (window.innerWidth < 1024) setVisibleItems(2.5);
      else setVisibleItems(4.5);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  React.useEffect(() => {
    setActiveIndex(isLoopable ? items.length : 0);
  }, [items.length, isLoopable]);

  React.useEffect(() => {
    if (!transitionEnabled) {
      const timeout = setTimeout(() => {
        setTransitionEnabled(true);
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [transitionEnabled]);

  const handleNext = React.useCallback(() => {
    if (!transitionEnabled) return;
    if (isLoopable) {
      setActiveIndex((prev) => prev + 1);
    } else {
      const maxIndex = Math.max(0, items.length - Math.floor(visibleItems));
      setActiveIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
    }
  }, [transitionEnabled, isLoopable, items.length, visibleItems]);

  const handlePrev = React.useCallback(() => {
    if (!transitionEnabled) return;
    if (isLoopable) {
      setActiveIndex((prev) => prev - 1);
    } else {
      const maxIndex = Math.max(0, items.length - Math.floor(visibleItems));
      setActiveIndex((prev) => (prev <= 0 ? maxIndex : prev - 1));
    }
  }, [transitionEnabled, isLoopable, items.length, visibleItems]);

  React.useEffect(() => {
    if (isPaused || items.length <= visibleItems) return;
    const interval = setInterval(() => {
      handleNext();
    }, 3500);
    return () => clearInterval(interval);
  }, [isPaused, handleNext, items.length, visibleItems]);

  const handleTransitionEnd = () => {
    if (!isLoopable) return;
    if (activeIndex >= 2 * items.length) {
      setTransitionEnabled(false);
      setActiveIndex(activeIndex - items.length);
    } else if (activeIndex < items.length) {
      setTransitionEnabled(false);
      setActiveIndex(activeIndex + items.length);
    }
  };

  if (!items || items.length === 0) return null;

  const cardWidthCalc = `calc(${100 / visibleItems}% - ${((visibleItems - 1) * 24) / visibleItems}px)`;
  const extendedItems = isLoopable ? [...items, ...items, ...items] : items;

  return (
    <div 
      className="w-full select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            {title || "Featured Companies"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={handleNext}
            className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden w-full rounded-2xl">
        <div 
          className="flex gap-6"
          onTransitionEnd={handleTransitionEnd}
          style={{
            transform: `translateX(calc(-${activeIndex * (100 / visibleItems)}% - ${activeIndex * 24}px))`,
            transition: transitionEnabled ? "transform 500ms ease-out" : "none",
          }}
        >
          {extendedItems.map((c, index) => (
            <div 
              key={`${c.id}-clone-${index}`} 
              className="flex-none bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-lg hover:border-slate-300 transition-all duration-300 overflow-hidden flex flex-col group"
              style={{ width: cardWidthCalc }}
            >
              {/* Card Top: Logo Container */}
              <div className="h-36 bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden shrink-0 border-b border-slate-100">
                <div className="absolute inset-0 bg-linear-to-br from-white/10 to-slate-200/20 group-hover:scale-105 transition-transform duration-500" />
                {c.logo_url ? (
                  <img
                    src={c.logo_url}
                    alt={c.name}
                    className="max-h-20 max-w-full object-contain relative z-10 filter drop-shadow-xs group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-[#002B5B] to-[#3b82f6] text-white flex items-center justify-center text-lg font-bold relative z-10 shadow-xs">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Card Content */}
              <div className="p-4 flex flex-col justify-between grow">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 group-hover:text-[#002B5B] transition-colors truncate max-w-[180px]">
                      {c.name}
                    </span>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-[#3b82f6] transition-colors"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md inline-block uppercase tracking-wider">
                    {c.users} {usersLabel}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
