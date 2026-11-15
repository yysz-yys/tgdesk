import type { ChatThemeDTO } from "./themeStore";

/**
 * Telegram's eight global chat themes as the official Web K sees them:
 * 🐥 ⛄ 💎 👨‍🏫 🌷 💜 🎄 🎮, each with its four palette variants — the Day
 * (baseThemeDay), Classic, Night (baseThemeNight) and Tinted bases. The Night
 * entries carry the dark-shell accents and wallpapers the reference paints
 * (e.g. the 🌷 theme's #eb6b8e accent and black mask wallpaper), which the
 * account.getChatThemes data this port can fetch predates — it ships only
 * Classic + Tinted. The kernel fetches the live list (for the pattern
 * documents served over its loopback server); this table is the offline
 * fallback and supplies the missing Night variants when the live list
 * arrives. Ids match the live entries, so a stored selection keeps
 * matching after the live list replaces this table.
 *
 * Colours are the server objects verbatim: `wallPaperSettings` gradient
 * stops, `accent_color`, `message_colors` and the signed `intensity`
 * (positive = day overlay, negative = night mask).
 */
export const FALLBACK_GLOBAL_THEMES: ChatThemeDTO[] = [
  {
    id: 5431620009950445886,
    slug: "lp0prF8ISFAEAAAA_p385_CvG0w",
    title: "\ud83d\udc25 Theme",
    emoticon: "\ud83d\udc25",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 2601329,
        outboxAccent: 4960357,
        messageColors: [14874076, 15528630, 15529661, 14546626],
        wallpaper: {
          colors: [8895909, 12180867, 14014604, 10864773],
          intensity: 42,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 4632699,
        messageColors: [10797662, 7123805, 4895406, 7191685],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 8703589,
        messageColors: [7508026, 5082961, 3507817, 5935172],
        wallpaper: {
          colors: [2440488, 10854263, 2965046, 8164449],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 8703589,
        messageColors: [5933641, 8162633, 5342546, 3833699],
        wallpaper: {
          colors: [2187083, 10983275, 4477977, 6794061],
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
    title: "\u26c4\ufe0f Theme",
    emoticon: "\u26c4",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 3903419,
        outboxAccent: 3903419,
        messageColors: [15005439, 15924476, 15268603, 15200505],
        wallpaper: {
          colors: [8497648, 10408948, 11460306, 12633324],
          intensity: 41,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 5546445,
        messageColors: [6009820, 6408377, 5883080, 6263513],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 5019631,
        messageColors: [6008500, 4818324, 5080241, 4940703],
        wallpaper: {
          colors: [6466222, 2503489, 8427911, 2304827],
          intensity: -57,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 5019631,
        messageColors: [4156319, 5744567, 5022110, 4227505],
        wallpaper: {
          colors: [4884883, 2701417, 3515572, 2508614],
          intensity: -51,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431859523096674543,
    slug: "p-pXcflrmFIBAAAAvXYQk-mCwZU",
    title: "\ud83d\udc8e Theme",
    emoticon: "\ud83d\udc8e",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 12081361,
        messageColors: [3256801],
        wallpaper: {
          colors: [9944811, 11659754, 13021679, 15710172],
          intensity: 50,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 9729480,
        messageColors: [10645722, 6790118, 6144475, 6390759],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 14252784,
        messageColors: [5594785, 5986212, 4807073, 3508640],
        wallpaper: {
          colors: [2172493, 6784419, 1648459, 11171002],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 12346072,
        messageColors: [4942250, 5724084, 3700650, 3186357],
        wallpaper: {
          colors: [2499660, 5013388, 1713474, 8149410],
          intensity: -59,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431737687759388684,
    slug: "CJNyxPMgSVAEAAAAvW9sMwc51cw",
    title: "\ud83d\udc68\u200d\ud83c\udfeb Theme",
    emoticon: "\ud83d\udc68\u200d\ud83c\udfeb",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 2143654,
        outboxAccent: 4828778,
        messageColors: [14219237, 16055267],
        wallpaper: {
          colors: [13755285, 9556684, 7780582, 9557658],
          intensity: 50,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 2992064,
        messageColors: [3845568, 6014105, 7780470, 6864568],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 8767203,
        messageColors: [4294269, 6131304, 4752499, 4553868],
        wallpaper: {
          colors: [7184290, 3034425, 6716244, 1721151],
          intensity: -61,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 4762842,
        messageColors: [2456432, 5935478, 4686966, 5208213],
        wallpaper: {
          colors: [5018786, 3362425, 6851682, 935234],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431380243401146580,
    slug: "mP3FG_iwSFAFAAAA2AklJO978pA",
    title: "\ud83c\udf37 Theme",
    emoticon: "\ud83c\udf37",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 13914243,
        outboxAccent: 16032342,
        messageColors: [16446423, 16509907, 16771544],
        wallpaper: {
          colors: [15511182, 15254915, 15442113, 13087211],
          intensity: 50,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 13397635,
        messageColors: [13394337, 14846032, 14131773, 14576991],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 15428494,
        messageColors: [14321210, 12213066, 12211057, 10506622],
        wallpaper: {
          colors: [12622837, 5515835, 15052663, 5845028],
          intensity: -58,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 15430045,
        messageColors: [13664311, 13196879, 11490956, 11355747],
        wallpaper: {
          colors: [11369461, 6041153, 14056009, 6048886],
          intensity: -54,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431868061491658948,
    slug: "O-wmAfBPSFADAAAA4zINVfD_bro",
    title: "\ud83d\udc9c Theme",
    emoticon: "\ud83d\udc9c",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 9461452,
        messageColors: [12999050],
        wallpaper: {
          colors: [15308995, 15312086, 12034025, 15511668],
          intensity: 57,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 10512582,
        messageColors: [10189778, 13727685, 15042887, 14839707],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 11630812,
        messageColors: [11163283, 10901614, 9065618, 6048139],
        wallpaper: {
          colors: [8222680, 4008280, 10976357, 7028568],
          intensity: -59,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 9599956,
        messageColors: [11689081, 10701443, 8541356, 7362230],
        wallpaper: {
          colors: [7302835, 4406654, 10381645, 6041944],
          intensity: -67,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431640436814905452,
    slug: "-Xc-np9y2VMCAAAARKr0yNNPYW0",
    title: "\ud83c\udf84 Theme",
    emoticon: "\ud83c\udf84",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 2726959,
        outboxAccent: 16104009,
        messageColors: [16775881, 16641979],
        wallpaper: {
          colors: [15310167, 15651185, 15637864, 14733438],
          intensity: 64,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 4563819,
        messageColors: [14131012, 14267955, 14125378, 14906175],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 8238429,
        messageColors: [11098153, 12554548, 10640159, 10900797],
        wallpaper: {
          colors: [7178314, 5187344, 10714432, 3953221],
          intensity: -60,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 8247383,
        messageColors: [13460052, 13531962, 12820016, 13461573],
        wallpaper: {
          colors: [5849645, 10780989, 6044457, 9080644],
          intensity: -61,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
  {
    id: 5431418395595636796,
    slug: "kO4jyq55SFABAAAA0WEpcLfahXk",
    title: "\ud83c\udfae Theme",
    emoticon: "\ud83c\udfae",
    settings: [
      {
        baseTheme: "classic",
        dark: false,
        accent: 5667299,
        messageColors: [16774101, 16776669],
        wallpaper: {
          colors: [4247006, 11306733, 15303896, 15717209],
          intensity: 52,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "day",
        dark: false,
        accent: 6389973,
        messageColors: [3910367, 9789919, 14640266, 14651439],
        wallpaper: {
          colors: [16777215],
          intensity: 0,
          pattern: true,
          dark: false,
        },
      },
      {
        baseTheme: "night",
        dark: true,
        accent: 6515951,
        messageColors: [5156291, 7031235, 14966966, 14844213],
        wallpaper: {
          colors: [7314621, 1980258, 9272509, 5649495],
          intensity: -59,
          pattern: true,
          dark: true,
        },
      },
      {
        baseTheme: "tinted",
        dark: true,
        accent: 6515694,
        messageColors: [5221827, 7031235, 14901430, 14910004],
        wallpaper: {
          colors: [3644604, 1326682, 8352459, 5124939],
          intensity: -74,
          pattern: true,
          dark: true,
        },
      },
    ],
  },
];

/**
 * Grafts the bundled official four-variant data onto the live theme list.
 *
 * account.getChatThemes — the source this port can fetch — carries only the
 * Classic and Tinted variants of each global theme, while the reference's own
 * list also has the Day and Night (baseThemeNight) variants. The Night entry is
 * the one that defines the dark shell's accent and wallpaper (the 🌷 theme's
 * #eb6b8e accent, the chick theme's #84ce65, black mask wallpapers), so a live
 * theme keeps the bundled variants wholesale and only borrows the live pattern
 * document URL, which the kernel's loopback server hosts. Unknown (custom)
 * themes pass through untouched.
 */
export function mergeLiveGlobalThemes(live: ChatThemeDTO[]): ChatThemeDTO[] {
  return live.map((theme) => {
    const bundled = FALLBACK_GLOBAL_THEMES.find(
      (item) =>
        item.id === theme.id ||
        (Boolean(item.emoticon) && item.emoticon === theme.emoticon),
    );
    if (!bundled) {
      return theme;
    }
    const livePatternUrl = theme.settings
      ?.map((settings) => settings.wallpaper?.patternUrl)
      .find(Boolean);
    return {
      ...theme,
      settings: bundled.settings?.map((variant) => ({
        ...variant,
        wallpaper: variant.wallpaper
          ? {
              ...variant.wallpaper,
              patternUrl: livePatternUrl ?? variant.wallpaper.patternUrl,
            }
          : variant.wallpaper,
      })),
    };
  });
}

/** The factory tile of the Appearance strip (its "no theme" thumbnail). */
export const DEFAULT_TILE_THEME: ChatThemeDTO = {
  id: 0,
  slug: "",
  title: "Day",
  emoticon: "🏠",
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
