import type {
  Category,
  Product,
  CouponTemplate,
  DemoAddress,
  CampaignRoute,
  Slot,
} from "../../../packages/shared/src/api.ts";
export const categories: Category[] = [
  { id: "objects", name: "日常器物" },
  { id: "travel", name: "轻装出行" },
  { id: "desk", name: "桌面灵感" },
  { id: "reading", name: "阅读记录" },
];
const data: Array<
  [
    string,
    string,
    string,
    Product["art"],
    Array<[string, string, number, number]>,
  ]
> = [
  [
    "cup",
    "晨间陶瓷杯",
    "objects",
    "cup",
    [
      ["cup-sand", "砂岩白", 12900, 8],
      ["cup-moss", "苔藓绿", 13900, 3],
      ["cup-clay", "陶土红", 13900, 0],
    ],
  ],
  [
    "bag",
    "轻行帆布袋",
    "travel",
    "bag",
    [
      ["bag-natural", "原色", 18900, 6],
      ["bag-forest", "森林绿", 19900, 4],
    ],
  ],
  [
    "lamp",
    "折线桌灯",
    "desk",
    "lamp",
    [
      ["lamp-cream", "奶油白", 25900, 5],
      ["lamp-red", "砖红", 27900, 2],
    ],
  ],
  [
    "bottle",
    "山野随行水瓶",
    "travel",
    "bottle",
    [
      ["bottle-sage", "鼠尾草", 15900, 9],
      ["bottle-stone", "岩灰", 15900, 7],
    ],
  ],
  [
    "book",
    "方格灵感手册",
    "reading",
    "book",
    [
      ["book-clay", "陶土", 5900, 20],
      ["book-olive", "橄榄", 5900, 12],
    ],
  ],
  [
    "speaker",
    "桌面声音方盒",
    "desk",
    "speaker",
    [
      ["speaker-sand", "沙色", 32900, 4],
      ["speaker-dark", "石墨", 32900, 2],
    ],
  ],
  [
    "cup-mini",
    "浓缩咖啡对杯",
    "objects",
    "cup",
    [
      ["cup-mini-white", "白釉", 9900, 1],
      ["cup-mini-blue", "蓝釉", 10000, 5],
    ],
  ],
  [
    "tote",
    "周末折叠包",
    "travel",
    "bag",
    [
      ["tote-grey", "雾灰", 12899, 5],
      ["tote-green", "松绿", 12901, 20],
    ],
  ],
  [
    "reading-light",
    "夜读小灯",
    "desk",
    "lamp",
    [
      ["reading-light-cream", "浅米", 19999, 5],
      ["reading-light-red", "绛红", 20000, 1],
    ],
  ],
  [
    "flask",
    "小径保温瓶",
    "objects",
    "bottle",
    [
      ["flask-sand", "砂白", 10001, 20],
      ["flask-grey", "石灰", 9999, 5],
    ],
  ],
  [
    "sketch",
    "速写记录本",
    "reading",
    "book",
    [
      ["sketch-grey", "点阵", 3900, 20],
      ["sketch-green", "空白", 4900, 5],
    ],
  ],
  [
    "radio",
    "口袋白噪音盒",
    "desk",
    "speaker",
    [
      ["radio-cream", "云白", 22900, 5],
      ["radio-dark", "夜色", 23900, 0],
    ],
  ],
];
export function productSeed(): Product[] {
  return data.map(([id, name, category, art, skus]) => ({
    id,
    name,
    category,
    art,
    description: "原创模拟商品，仅用于体验库存、金额与订单规则，不销售实物。",
    skus: skus.map(([skuId, label, price, stock]) => ({
      id: skuId,
      label,
      price,
      stock,
      reserved: 0,
      available: stock,
    })),
  }));
}
export const couponTemplates: CouponTemplate[] = [
  { id: "C10", name: "满 100 减 10", minimum: 10000, discount: 1000 },
  { id: "C20", name: "满 200 减 20", minimum: 20000, discount: 2000 },
];
export const addresses: DemoAddress[] = [
  {
    id: "studio",
    title: "虚拟工作室",
    address: "模拟城市 · 灵感街区 · 仅供演示",
  },
  {
    id: "home",
    title: "虚拟生活空间",
    address: "模拟城市 · 周末社区 · 不收集真实地址",
  },
];
export const campaignRoutes: CampaignRoute[] = [
  {
    id: "slow",
    campaignId: "weekend",
    title: "沿河慢行 · 城市观察",
    description: "放慢脚步，记录水岸与街区的细节。原创虚构路线。",
    theme: "quiet",
    environment: "outdoor",
    duration: 90,
    intensity: "low",
    highlights: ["沿河散步", "建筑观察", "光影记录"],
  },
  {
    id: "maker",
    campaignId: "weekend",
    title: "几何印记 · 创作实验",
    description: "用形状和颜色制作属于自己的城市印记。原创模拟活动。",
    theme: "creative",
    environment: "indoor",
    duration: 120,
    intensity: "low",
    highlights: ["图形构成", "纸上版画", "作品交流"],
  },
  {
    id: "explore",
    campaignId: "weekend",
    title: "街巷探索 · 周末漫游",
    description: "沿虚构街巷完成观察与记录任务。无需真实定位。",
    theme: "active",
    environment: "outdoor",
    duration: 150,
    intensity: "medium",
    highlights: ["街区探索", "声音采样", "小组协作"],
  },
];
export function slotSeed(now: number): Slot[] {
  return campaignRoutes.flatMap((route, ri) =>
    [0, 1, 2].map((i) => {
      const startsAt = now + (2 + i * 6 + ri) * 3600000;
      const status: Slot["status"] =
        ri === 0 && i === 2
          ? "CLOSED"
          : ri === 1 && i === 2
            ? "CANCELLED"
            : ri === 2 && i === 2
              ? "ENDED"
              : "OPEN";
      const capacity = ri === 2 && i === 1 ? 1 : 12;
      const reserved = ri === 1 && i === 1 ? 12 : 0;
      return {
        id: `${route.id}-${i + 1}`,
        routeId: route.id,
        startsAt: new Date(
          status === "ENDED" ? now - 7200000 : startsAt,
        ).toISOString(),
        deadline: new Date(
          status === "CLOSED" ? now - 1000 : startsAt - 1800000,
        ).toISOString(),
        endsAt: new Date(
          status === "ENDED" ? now - 1000 : startsAt + route.duration * 60000,
        ).toISOString(),
        capacity,
        reserved,
        available: capacity - reserved,
        status,
      };
    }),
  );
}
