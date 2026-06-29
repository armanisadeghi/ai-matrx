import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { IconType, IconBaseProps } from "react-icons";
import {
    FaYoutube,
    FaGithub,
    FaXTwitter,
    FaFacebook,
    FaLinkedin,
    FaInstagram,
    FaChrome,
    FaTrello,
    FaGitlab,
} from "react-icons/fa6";
import { SiFigma } from "react-icons/si";

/**
 * lucide-react 1.0+ removed every trademarked brand logo (Youtube, Github, Gitlab,
 * Twitter/X, Facebook, Linkedin, Instagram, Chrome, Trello, Figma, ...). These shims
 * re-expose the brand glyphs
 * we still use as drop-in, `LucideIcon`-compatible components (identical `LucideProps`
 * surface + svg ref), so any former `lucide-react` brand import only swaps its source
 * to this module — registries/maps typed `LucideIcon` keep compiling untouched.
 *
 * Backed by react-icons (Font Awesome 6 brands). When lucide drops another brand we
 * rely on, add one line here — this is the single point of change for the whole class.
 */
const asLucideIcon = (Icon: IconType, name: string): LucideIcon => {
    const Shim = forwardRef<SVGSVGElement, LucideProps>(function BrandIcon(
        // lucide-only props that react-icons doesn't understand are dropped so they
        // don't leak onto the underlying <svg> as invalid attributes.
        { size = 24, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, ...rest },
        _ref,
    ) {
        return <Icon size={size} {...(rest as IconBaseProps)} />;
    });
    Shim.displayName = name;
    return Shim as unknown as LucideIcon;
};

export const Youtube = asLucideIcon(FaYoutube, "Youtube");
export const Github = asLucideIcon(FaGithub, "Github");
export const Twitter = asLucideIcon(FaXTwitter, "Twitter");
export const Facebook = asLucideIcon(FaFacebook, "Facebook");
export const Linkedin = asLucideIcon(FaLinkedin, "Linkedin");
export const Instagram = asLucideIcon(FaInstagram, "Instagram");
export const Chrome = asLucideIcon(FaChrome, "Chrome");
export const Trello = asLucideIcon(FaTrello, "Trello");
export const Gitlab = asLucideIcon(FaGitlab, "Gitlab");
export const Figma = asLucideIcon(SiFigma, "Figma");
