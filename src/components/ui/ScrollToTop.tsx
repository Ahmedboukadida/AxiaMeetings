"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";

export function ScrollToTop() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const toggleVisibility = () => {
            if (window.scrollY > 300) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        window.addEventListener("scroll", toggleVisibility);
        return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 20 }}
                    onClick={scrollToTop}
                    className="fixed bottom-28 right-6 z-[60] p-3 bg-[#002B5B] text-white rounded-2xl shadow-[0_20px_40px_rgba(0,43,91,0.2)] border border-white/10 backdrop-blur-xl hover:scale-110 active:scale-95 transition-all group"
                    aria-label="Scroll to top"
                >
                    <ChevronUp className="w-5 h-5 transition-transform group-hover:-translate-y-1" />
                    <span className="absolute inset-0 rounded-2xl ring-4 ring-blue-600/20 animate-ping opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.button>
            )}
        </AnimatePresence>
    );
}
