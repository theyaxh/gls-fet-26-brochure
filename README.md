# GLS University FET 2026 Brochure — Interactive Flipbook

A high-fidelity HTML/CSS/JS interactive flipbook built for the GLS University Faculty of Engineering & Technology 2026 brochure. 

Features:
- **Hybrid Format**: Opens as a gatefold/tri-fold brochure, then transitions into a standard multi-page booklet.
- **Responsive**: 2-page spread on desktop, single-page card-flip sequence on mobile devices.
- **GPU-Accelerated**: Smooth 3D page flip animations utilizing CSS `transform-style: preserve-3d`.
- **Audio Integration**: Realistic page leaf-flipping sound effects.

## How to Embed the Flipbook in Another Website

The easiest way to embed this viewer into another website (like Webflow, Framer, WordPress, or a custom HTML site) is to host this repository and use an `<iframe>`.

### 1. Host the Flipbook
Since this is a static site (just HTML, CSS, JS, and Images), you can host it for free on **GitHub Pages**:
1. Go to your repository settings on GitHub: `Settings` > `Pages`
2. Under **Build and deployment**, set the **Source** to `Deploy from a branch`.
3. Select the `main` branch and `/ (root)` folder, then click **Save**.
4. GitHub will give you a live URL (e.g., `https://theyaxh.github.io/gls-fet-26-brochure/`).

### 2. Embed via iFrame
Copy and paste this code into the target website where you want the flipbook to appear:

```html
<iframe 
  src="https://theyaxh.github.io/gls-fet-26-brochure/" 
  width="100%" 
  height="700px" 
  style="border: none; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);" 
  allow="fullscreen" 
  loading="lazy">
</iframe>
```

**Notes on Embedding:**
- Ensure you include `allow="fullscreen"` so the fullscreen API button inside the flipbook works perfectly when embedded.
- You can adjust the `height="700px"` value based on how much vertical space you want it to take on your webpage. The internal viewer will automatically adapt its internal aspect ratio based on the available space.
