---
name: STS GeoFlow
description: Field-to-PDF geotechnical project delivery
colors:
  sts-green: "#137A45"
  sts-green-deep: "#0C5D34"
  graphite: "#24282D"
  ink: "#17202A"
  muted: "#5B6673"
  surface: "#FFFFFF"
  workspace: "#F5F7F8"
  border: "#CBD3D9"
  valid: "#1A7F37"
  warning: "#A86800"
  blocker: "#B42318"
  info: "#1F6DAD"
typography:
  title:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
  label:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
rounded:
  control: "6px"
  panel: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.sts-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px"
---

# Design System: STS GeoFlow

## Overview

**Creative North Star: "The Field Register"**

STS GeoFlow should feel like a disciplined engineering field register made faster by software. It uses compact tables, clear section rules, stable dimensions, and an explicit depth hierarchy. Desktop screens support comparison and keyboard entry; phone screens present one observation editor at a time instead of shrinking wide tables.

The system rejects generic SaaS dashboard composition and decorative AI styling. Density is purposeful, elevation is rare, and every visual state should correspond to an engineering or workflow state.

**Key Characteristics:**

- Restrained STS identity
- Depth-led information
- Compact, repeatable controls
- Strong validation and selected states
- Structural responsive changes

## Colors

STS green identifies the brand, active navigation, confirmed states, and the principal command. Graphite carries table headers and the navigation rail. Blue is reserved for informational focus, while amber and red retain unambiguous warning and blocker roles.

**The One Accent Rule.** STS green is functional, not decorative; inactive surfaces remain neutral.

## Typography

**Display Font:** Segoe UI (with Arial fallback)
**Body Font:** Segoe UI (with Arial fallback)

**Character:** A single legible working family supports dense product UI and clear numerals. Hierarchy comes from weight, spacing, and rules rather than an ornamental display face.

- **Title** (700, 18px, 1.25): screen and workspace titles.
- **Body** (400, 13px, 1.4): field values, descriptions, and review text.
- **Label** (600, 12px, 1.25): controls, table headers, and compact status labels.
- Use `font-variant-numeric: tabular-nums` for depths, coordinates, SPT values, TCR, and RQD.

**The No Compression Rule.** Letter spacing is always zero; field labels may wrap but never overlap or truncate engineering values.

## Elevation

The interface is flat by default. Separation comes from neutral surface changes and 1 px borders. Shadows are reserved for temporary overlays such as menus, drawers, and modals and must not decorate ordinary panels.

**The Flat Register Rule.** If a section can be separated by alignment or a rule, it does not receive a shadow.

## Components

### Buttons

- **Shape:** restrained control radius (6px), at least 44 px high on touch layouts.
- **Primary:** STS green with white text; one dominant action per action strip.
- **Hover / Focus:** darker green on hover and a visible blue information focus ring.
- **Secondary:** white surface, neutral border, graphite text.

### Cards / Containers

- **Corner Style:** panels use at most 8px.
- **Background:** white over the cool neutral workspace.
- **Shadow Strategy:** none at rest.
- **Border:** 1 px neutral rule.
- **Internal Padding:** 12-16px, except data grids where row density is intentional.

### Inputs / Fields

- **Style:** white field, neutral 1 px stroke, 6px radius, tabular numerals for measurements.
- **Focus:** 2 px informational outline with sufficient contrast.
- **Error / Disabled:** pair semantic color with text or an icon; never color alone.

### Navigation

Desktop uses a graphite rail with a single STS green active state. Phone uses a fixed bottom navigation and a full-screen observation editor. Icons and labels remain stable between modules.

### Depth Grid

Sticky headers, clear selected rows, explicit gaps and overlaps, and stable numeric columns. The grid is a desktop and tablet overview; on phones, selecting a row opens a structured editor.

## Do's and Don'ts

### Do:

- **Do** show borehole, depth context, save/sync state, and validation near the active workspace.
- **Do** use STS green for brand, confirmed state, active navigation, and the primary action.
- **Do** keep tables compact on desktop and replace them with a focused editor on phones.
- **Do** use the 4, 8, 12, 16, 24, 32, 48 px spacing scale.

### Don't:

- **Don't** create a generic SaaS dashboard, marketing page, AI chatbot, cryptocurrency product, or student-project look.
- **Don't** use purple-blue gradients, glassmorphism, nested cards, oversized welcome banners, decorative animation, excessive pills, or excessive shadows.
- **Don't** hide engineering meaning to make a layout cleaner.
- **Don't** put critical field actions behind hover-only affordances or horizontal phone scrolling.
