import type { ChatThemeDTO } from "./themeStore";

/**
 * Telegram's eight global chat themes — the real `account.getChatThemes` set of
 * Web K 2.3: 🐥 ⛄ 💎 👨‍🏫 🌷 💜 🎄 🎮, each with a day (Classic base) and a
 * night (Tinted base) variant. The kernel fetches the live list (with the
 * pattern documents served over its loopback media server); this table is the
 * offline/preview fallback and keeps the same ids, so a selection made against
 * it still matches the live entry once it arrives.
 *
 * Colours come from the server objects: `wallPaperSettings` gradient stops,
 * `accent_color`, `message_colors` and the signed `intensity`
 * (positive = day overlay, negative = night mask).
 */
export const FALLBACK_GLOBAL_THEMES: ChatThemeDTO[] = [
  {
    id: 5431620009950445886,
    slug: "lp0prF8ISFAEAAAA_p385_CvG0w",
    title: "🐥 Chat Theme",
    emoticon: "🐥",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 2732145,
        outboxAccent: 5025892,
        messageColors: [15136213, 15791825],
        wallpaper: {
          colors: [7977128, 12834723, 14013845, 10866066],
          intensity: 42,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 5674079,
        messageColors: [6192443, 2128220],
        wallpaper: {
          colors: [2310725, 7174476, 2047025, 5541474],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431729175134208256,
    slug: "MIo6r0qGSFAFAAAAtL8TsDzNX60",
    title: "⛄️ Chat Theme",
    emoticon: "⛄",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 3317463,
        outboxAccent: 4367839,
        messageColors: [15727612, 15333371],
        wallpaper: {
          colors: [8497648, 10343668, 11460562, 12304367],
          intensity: 41,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 5019631,
        messageColors: [2261394, 3305130],
        wallpaper: {
          colors: [5274253, 2109771, 2122357, 1582382],
          intensity: -57,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431859523096674543,
    slug: "p-pXcflrmFIBAAAAvXYQk-mCwZU",
    title: "💎 Chat Theme",
    emoticon: "💎",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 10776791,
        outboxAccent: 5550056,
        messageColors: [15136767],
        wallpaper: {
          colors: [9944811, 11659754, 13021679, 15710172],
          intensity: 50,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 8806573,
        messageColors: [2456746, 4869798],
        wallpaper: {
          colors: [2499660, 4286356, 1713474, 7295121],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431737687759388684,
    slug: "CJNyxPMgSVAEAAAAvW9sMwc51cw",
    title: "👨‍🏫 Chat Theme",
    emoticon: "👨‍🏫",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 2143654,
        outboxAccent: 3452533,
        messageColors: [16055267],
        wallpaper: {
          colors: [13755285, 9556684, 7780582, 9557658],
          intensity: 50,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 5083299,
        messageColors: [5732947, 3697773],
        wallpaper: {
          colors: [4223869, 1916771, 5797203, 1656130],
          intensity: -61,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431380243401146580,
    slug: "mP3FG_iwSFAFAAAA2AklJO978pA",
    title: "🌷 Chat Theme",
    emoticon: "🌷",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 13658513,
        outboxAccent: 13933382,
        messageColors: [16773603],
        wallpaper: {
          colors: [15511182, 15254915, 15442113, 13087211],
          intensity: 50,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 12411780,
        messageColors: [12151869, 10044247],
        wallpaper: {
          colors: [8085921, 5254203, 10644559, 6042922],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431868061491658948,
    slug: "O-wmAfBPSFADAAAA4zINVfD_bro",
    title: "💜 Chat Theme",
    emoticon: "💜",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 10776791,
        outboxAccent: 14248063,
        messageColors: [16772078],
        wallpaper: {
          colors: [15308995, 15312086, 12034025, 15511668],
          intensity: 57,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 8676013,
        messageColors: [10834805, 6701434],
        wallpaper: {
          colors: [7230895, 3616344, 8671107, 5193521],
          intensity: -59,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431640436814905452,
    slug: "-Xc-np9y2VMCAAAARKr0yNNPYW0",
    title: "🎄 Chat Theme",
    emoticon: "🎄",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 5612377,
        outboxAccent: 13539151,
        messageColors: [16775136],
        wallpaper: {
          colors: [14721899, 15449723, 14718336, 16308350],
          intensity: 64,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 5866826,
        messageColors: [11371840, 11431746],
        wallpaper: {
          colors: [4155708, 4666134, 7495993, 2439462],
          intensity: -60,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431418395595636796,
    slug: "kO4jyq55SFABAAAA0WEpcLfahXk",
    title: "🎮 Chat Theme",
    emoticon: "🎮",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 6916326,
        outboxAccent: 13410377,
        messageColors: [16774101],
        wallpaper: {
          colors: [4247006, 11306733, 15303896, 14724429],
          intensity: 52,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 7370188,
        messageColors: [11958341, 9848425, 6375839, 2981550],
        wallpaper: {
          colors: [4226963, 1326682, 6708886, 3878219],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
];

/**
 * The first ("no custom theme") tile: the factory Web K Day palette of this
 * port. Night side mirrors tweb's DEFAULT_THEME so the strip still previews
 * properly in dark mode.
 */
export const DEFAULT_TILE_THEME: ChatThemeDTO = {
  id: 0,
  slug: "",
  title: "Day",
  settings: [
    {
      baseTheme: "classic",
      dark: false,
      accent: 0x2d7ed5,
      messageColors: [0x2d7ed5, 0x78ace4],
      wallpaper: {
        colors: [0xb1e0fa, 0x82b0d8, 0xa0d8e8, 0xe5f0f8],
        intensity: 50,
        pattern: true,
        dark: false,
      },
    },
    {
      baseTheme: "tinted",
      dark: true,
      accent: 0x8774e1,
      messageColors: [0x8774e1],
      wallpaper: {
        colors: [0x1e3557, 0x182036, 0x1c4352, 0x16263a],
        intensity: -40,
        pattern: true,
        dark: true,
      },
    },
  ],
};
