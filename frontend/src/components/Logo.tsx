import React from "react";

interface LogoProps {
    className?: string;
    size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className, size = 32 }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Background: Enlarged Royal Blue Hexagonal Core */}
            <path
                d="M20 2L38 11V29L20 38L2 29V11L20 2Z"
                fill="hsl(var(--primary))"
                stroke="hsl(var(--primary) / 0.8)"
                strokeWidth="1"
            />

            {/* The "Intelligence Node" structure - High precision lines */}
            <path
                d="M20 10V20M20 20L29 25M20 20L11 25"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Central Focal Point (RAG Nucleus) */}
            <circle cx="20" cy="20" r="4.5" fill="white" />

            {/* Subtle Accent: Terminal data points */}
            <circle cx="20" cy="10" r="2" fill="white" opacity="0.8" />
            <circle cx="29" cy="25" r="2" fill="white" opacity="0.8" />
            <circle cx="11" cy="25" r="2" fill="white" opacity="0.8" />
        </svg>
    );
};
