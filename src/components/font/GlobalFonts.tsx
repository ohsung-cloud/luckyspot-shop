import { Tilt_Warp } from "next/font/google";

const tiltWarp = Tilt_Warp({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-tilt-warp",
});

const GlobalFonts = () => {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
      @font-face {
        font-family: "Paperozi";
        src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-4Regular.woff2")
          format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Paperozi";
        src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-5Medium.woff2")
          format("woff2");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Paperozi";
        src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-6SemiBold.woff2")
          format("woff2");
        font-weight: 600;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Paperozi";
        src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2")
          format("woff2");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }

      html,
      body {
        font-family: "Paperozi", sans-serif;
        font-style: normal;
        font-weight: 400;
        font-size: 16px;
        line-height: 140%;
      }
    `,
      }}
    />
  );
};

export const fontVariables = tiltWarp.variable;

export default GlobalFonts;
