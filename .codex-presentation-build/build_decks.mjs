import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = process.cwd();
const SKILL_DIR = "C:/Users/97250/.codex/plugins/cache/openai-primary-runtime/presentations/26.930.11008/skills/presentations";
const buildDir = path.join(workspaceDir, ".codex-presentation-build");
const outputDir = path.join(workspaceDir, "presentation_output");
const assetsDir = path.join(workspaceDir, "presentation_assets");
const RUNTIME_PYTHON = "C:/Users/97250/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
process.env.RUNTIME_NODE_MODULES = 'C:/Users/97250/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
process.env.RUNTIME_NODE = process.execPath;
process.env.RUNTIME_BIN_DIR = 'C:/Users/97250/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override';
const { finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href,
);

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const W = 1280;
const H = 720;
const FONT = "Arial";

const themes = {
  nature: {
    key: "nature",
    bg: "#F7F2E8",
    paper: "#FFFDF7",
    ink: "#39463C",
    muted: "#6E746B",
    accent: "#B9674F",
    green: "#7E916B",
    gold: "#C7A15A",
    teal: "#557C78",
    plum: "#9B6874",
    line: "#D9CDBB",
    image: path.join(assetsDir, "watercolor-hands.png"),
    coverText: { left: 90, top: 165, width: 560, align: "right" },
    label: "גרסת טבע ואקוורל",
  },
  modern: {
    key: "modern",
    bg: "#F2EEE5",
    paper: "#FBF8F1",
    ink: "#28342F",
    muted: "#6B6A64",
    accent: "#A65F48",
    green: "#314B40",
    gold: "#B87852",
    teal: "#526D69",
    plum: "#765564",
    line: "#D2C5B5",
    image: path.join(assetsDir, "modern-line-art.png"),
    coverText: { left: 690, top: 170, width: 500, align: "right" },
    label: "גרסה מודרנית ושקטה",
  },
};

const urls = {
  lovett: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1847521/",
  goodheart: "https://icakusa.com/about-icak/founder/",
  icak: "https://icakusa.com/about-icak/",
  touch: "https://www.touchforhealth.us/history",
  nccih: "https://files.nccih.nih.gov/s3fs-public/Traditional_Chinese_Medicine_08-03-2015.pdf",
  five: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7356495/",
  shared: "https://chatgpt.com/share/6abce6d3-b970-83eb-92ae-f5cfcf2f6e50?ogimg=plain",
};

function addShape(slide, geometry, position, fill = "none", lineFill = "none", lineWidth = 0) {
  return slide.shapes.add({
    geometry,
    position,
    fill,
    line: { style: "solid", fill: lineFill, width: lineWidth },
  });
}

function addText(slide, text, position, opts = {}) {
  const shape = addShape(slide, "textbox", position, opts.fill ?? "none", opts.line ?? "none", opts.lineWidth ?? 0);
  shape.text = text;
  shape.text.style = {
    typeface: FONT,
    fontSize: opts.fontSize ?? 28,
    bold: opts.bold ?? false,
    color: opts.color ?? "#222222",
    alignment: opts.alignment ?? "right",
    verticalAlignment: opts.verticalAlignment ?? "middle",
    autoFit: opts.autoFit ?? "shrinkText",
    wrap: "square",
    lineSpacing: opts.lineSpacing ?? 1.0,
    insets: opts.insets ?? { top: 2, right: 2, bottom: 2, left: 2 },
  };
  return shape;
}

function addTitle(slide, title, theme, subtitle) {
  if (theme.key === "modern") {
    addShape(slide, "rect", { left: 0, top: 0, width: 24, height: H }, theme.green);
  }
  addText(slide, title, { left: 190, top: 42, width: 1000, height: 68 }, {
    fontSize: 32, bold: true, color: theme.ink, alignment: "right", autoFit: "none",
  });
  if (subtitle) {
    addText(slide, subtitle, { left: 300, top: 106, width: 890, height: 44 }, {
      fontSize: 20, color: theme.muted, alignment: "right",
    });
  }
  addShape(slide, "line", { left: 88, top: 142, width: 1100, height: 0 }, "none", theme.line, 2);
}

function addFooter(slide, theme, number) {
  addText(slide, theme.label, { left: 68, top: 672, width: 300, height: 24 }, {
    fontSize: 12, color: theme.muted, alignment: "left",
  });
  addText(slide, String(number).padStart(2, "0"), { left: 1168, top: 670, width: 50, height: 26 }, {
    fontSize: 13, color: theme.muted, alignment: "right",
  });
}

function addCircleLabel(slide, theme, x, y, diameter, fill, title, detail, titleColor = "#FFFFFF") {
  const circle = addShape(slide, "ellipse", { left: x, top: y, width: diameter, height: diameter }, fill, "none", 0);
  addText(slide, title, { left: x + 10, top: y + diameter * 0.27, width: diameter - 20, height: 38 }, {
    fontSize: 27, bold: true, color: titleColor, alignment: "center",
  });
  if (detail) {
    addText(slide, detail, { left: x + 10, top: y + diameter * 0.52, width: diameter - 20, height: 42 }, {
      fontSize: 15, color: titleColor, alignment: "center", lineSpacing: 0.9,
    });
  }
  return circle;
}

function notes(slide, talk, citations = []) {
  const citationText = citations.length ? `\n\nמקורות:\n${citations.join("\n")}` : "";
  slide.speakerNotes.textFrame.setText(`${talk}${citationText}`);
}

function addCycleConnectors(slide, nodes, order, color, kind = "straight") {
  for (let i = 0; i < order.length; i += 1) {
    const from = nodes[order[i]];
    const to = nodes[order[(i + 1) % order.length]];
    slide.shapes.connect(from, to, {
      kind,
      line: { style: "solid", fill: color, width: 3 },
      tail: { type: "triangle", width: "sm", length: "sm" },
    });
  }
}

function fiveNodePositions() {
  return {
    fire: { x: 555, y: 170 },
    earth: { x: 855, y: 305 },
    metal: { x: 745, y: 530 },
    water: { x: 360, y: 530 },
    wood: { x: 245, y: 305 },
  };
}

function blend(hex, other, ratio) {
  const rgb = value => value.replace('#', '').match(/../g).map(x => parseInt(x, 16));
  return '#' + rgb(hex).map((x, i) => Math.round(x * (1 - ratio) + rgb(other)[i] * ratio).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function monochromeTheme(base, slideNumber) {
  const palette = base.key === 'nature'
    ? ['#7E916B', '#557C78', '#B9674F', '#C7A15A', '#7E916B', '#8A8881', '#557C78']
    : ['#314B40', '#765564', '#A65F48', '#B87852', '#314B40', '#765564', '#314B40'];
  const color = palette[slideNumber - 2];
  const accent = blend(color, '#000000', 0.17);
  return { ...base, bg: blend(color, '#FFFFFF', 0.88), paper: blend(color, '#FFFFFF', 0.97),
    ink: blend(color, '#000000', 0.60), muted: blend(color, '#000000', 0.38),
    line: blend(color, '#FFFFFF', 0.55), accent, green: accent, gold: accent, teal: accent, plum: accent };
}

async function buildDeck(baseTheme) {
  let theme = baseTheme;
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  const imageBytes = new Uint8Array(await fs.readFile(theme.image));

  // 1. Cover
  {
    const slide = presentation.slides.add();
    slide.background.fill = theme.bg;
    slide.images.add({
      blob: imageBytes,
      contentType: "image/png",
      alt: theme.key === "nature" ? "איור אקוורל עדין של ידיים, צמחייה וזרימה" : "איור קווי עדין של דמות ואלמנטים מחוברים",
      fit: "cover",
      position: { left: 0, top: 0, width: W, height: H },
    });
    const p = theme.coverText;
    addText(slide, "קינסיולוגיה מעשית", { left: p.left, top: p.top, width: p.width, height: 90 }, {
      fontSize: 48, bold: true, color: theme.ink, alignment: p.align,
    });
    addText(slide, "להקשיב לגוף, לרגש ולמה שנמצא מתחת למילים", { left: p.left, top: p.top + 92, width: p.width, height: 72 }, {
      fontSize: 25, color: theme.ink, alignment: p.align, lineSpacing: 1.05,
    });
    addText(slide, "מבוא קצר להיסטוריה ולחמשת האלמנטים", { left: p.left, top: p.top + 175, width: p.width, height: 38 }, {
      fontSize: 17, color: theme.muted, alignment: p.align,
    });
    notes(slide, "פתיחה מוצעת: התחילי מהחוויה האישית שלך. ספרי במשפט אחד איך הגעת לקינסיולוגיה, ואז הזמיני את הקהל למסע קצר בין ההיסטוריה, הגוף וחמשת האלמנטים.");
  }

  // 2. What it is
  {
    theme = monochromeTheme(baseTheme, 2);
    const slide = presentation.slides.add();
    slide.background.fill = theme.bg;
    addTitle(slide, "מהי קינסיולוגיה מעשית", theme, "גישה טיפולית אישית שנבנתה מתוך לימוד, ניסיון והקשבה");
    addText(slide, "תגובה של שריר משמשת כמשוב בתוך שיחה טיפולית", { left: 630, top: 190, width: 530, height: 110 }, {
      fontSize: 34, bold: true, color: theme.accent, alignment: "right", lineSpacing: 0.95,
    });
    addText(slide,
      "בדרך הזאת מתבוננים בקשר בין תגובת הגוף לבין סטרס, רגשות, תפיסות ואמונות. הבדיקה אינה עומדת לבדה. היא משתלבת בהקשבה למטופל ובשיקול הדעת של המטפלת.",
      { left: 640, top: 320, width: 520, height: 190 },
      { fontSize: 24, color: theme.ink, alignment: "right", lineSpacing: 1.08 });

    addShape(slide, "ellipse", { left: 130, top: 205, width: 300, height: 300 }, theme.paper, theme.line, 2);
    addText(slide, "הגוף", { left: 190, top: 250, width: 180, height: 52 }, { fontSize: 31, bold: true, color: theme.green, alignment: "center" });
    addText(slide, "משוב", { left: 190, top: 330, width: 180, height: 52 }, { fontSize: 31, bold: true, color: theme.accent, alignment: "center" });
    addText(slide, "הקשבה", { left: 190, top: 410, width: 180, height: 52 }, { fontSize: 31, bold: true, color: theme.teal, alignment: "center" });
    addText(slide, "המצגת מציגה תפיסות טיפוליות ומסורות מקצועיות. היא אינה תחליף לאבחון או טיפול רפואי.", { left: 120, top: 600, width: 1040, height: 38 }, {
      fontSize: 14, color: theme.muted, alignment: "center",
    });
    addFooter(slide, theme, 2);
    notes(slide, "הדגישי את ההבדל בין בדיקת כוח שריר רפואית לבין השימוש בתגובת השריר בעולם הקינסיולוגיה. אפשר לומר: השריר הוא חלק מתהליך ההקשבה, לא תשובה קסומה ולא תחליף לבדיקה רפואית.", [urls.shared]);
  }

  // 3. Timeline
  {
    theme = monochromeTheme(baseTheme, 3);
    const slide = presentation.slides.add();
    slide.background.fill = theme.bg;
    addTitle(slide, "התפתחות הקינסיולוגיה המעשית", theme, "לא ממציא יחיד, אלא שרשרת של רעיונות ושיטות");
    const items = [
      { year: "1915", head: "בדיקות כוח שרירים", body: "כלי רפואי ופיזיותרפי להערכת חולשת שרירים", color: theme.teal },
      { year: "1964", head: "ג׳ורג׳ גודהארט", body: "פיתוח Applied Kinesiology ושילוב בדיקת השריר בהערכה טיפולית", color: theme.green },
      { year: "1973", head: "ג׳ון ת׳י", body: "Touch for Health מנגיש את הרעיונות לקהל רחב", color: theme.gold },
      { year: "שנות ה־80", head: "הכיוון הרגשי", body: "מתפתחות גישות שעוסקות בסטרס, רגשות, תפיסות ואמונות", color: theme.plum },
    ];
    const y = theme.key === "nature" ? 330 : 300;
    addShape(slide, "line", { left: 112, top: y + 38, width: 1050, height: 0 }, "none", theme.line, 5);
    items.forEach((item, i) => {
      const x = 120 + i * 278;
      addShape(slide, "ellipse", { left: x, top: y, width: 76, height: 76 }, item.color);
      addText(slide, String(i + 1), { left: x, top: y + 12, width: 76, height: 48 }, { fontSize: 25, bold: true, color: "#FFFFFF", alignment: "center" });
      addText(slide, item.year, { left: x - 18, top: y - 82, width: 220, height: 48 }, { fontSize: 27, bold: true, color: theme.ink, alignment: "right" });
      addText(slide, item.head, { left: x - 30, top: y + 92, width: 240, height: 44 }, { fontSize: 21, bold: true, color: item.color, alignment: "right" });
      addText(slide, item.body, { left: x - 30, top: y + 138, width: 240, height: 104 }, { fontSize: 17, color: theme.ink, alignment: "right", lineSpacing: 1.0 });
    });
    addText(slide, "השם ״קינסיולוגיה מעשית״ מתאר את הדרך שנבנתה מתוך השורשים האלה ומתוך ניסיון טיפולי אישי", { left: 155, top: 575, width: 970, height: 55 }, {
      fontSize: 21, bold: true, color: theme.accent, alignment: "center",
    });
    addFooter(slide, theme, 3);
    notes(slide, "טיפ הגשה: אל תקראי את כל הציר. עצרי בכל תחנה לסיפור קצר. בשלב של שנות ה־80 אפשר לחבר ישירות לעבודה שלך עם סטרס, רגשות ואמונות.", [urls.lovett, urls.goodheart, urls.icak, urls.touch, urls.shared]);
  }

  // 4. Personal path
  {
    theme = monochromeTheme(baseTheme, 4);
    const slide = presentation.slides.add();
    slide.background.fill = theme.bg;
    addTitle(slide, "הדרך האישית שלי", theme, "קינסיולוגיה מעשית כשפה שנבנית במפגש עם אנשים");
    if (theme.key === "nature") {
      addShape(slide, "ellipse", { left: 75, top: 185, width: 500, height: 390 }, theme.paper, theme.line, 2);
    } else {
      addShape(slide, "rect", { left: 80, top: 190, width: 460, height: 370 }, theme.green);
    }
    addText(slide, "כ־18 שנים של עבודה טיפולית", { left: 130, top: 245, width: 360, height: 70 }, {
      fontSize: 34, bold: true, color: theme.key === "nature" ? theme.green : "#FFFFFF", alignment: "center",
    });
    addText(slide, "לימוד פרטי\nניסיון מצטבר\nשילוב כלים מעולמות שונים", { left: 135, top: 340, width: 350, height: 150 }, {
      fontSize: 24, color: theme.key === "nature" ? theme.ink : "#F6F0E6", alignment: "center", lineSpacing: 1.2,
    });
    addText(slide, "״למדתי קינסיולוגיה באופן פרטי. עם השנים, מתוך המפגש עם מטופלים ומתוך שילוב של כלים, התפתחה אצלי דרך עבודה שאני קוראת לה קינסיולוגיה מעשית.״", { left: 620, top: 220, width: 540, height: 270 }, {
      fontSize: 30, bold: true, color: theme.ink, alignment: "right", lineSpacing: 1.08,
    });
    addText(slide, "הסמכות מגיעה מן הכנות, מן הניסיון ומן היכולת להסביר בבירור מה אני עושה", { left: 625, top: 510, width: 535, height: 82 }, {
      fontSize: 20, color: theme.accent, alignment: "right",
    });
    addFooter(slide, theme, 4);
    notes(slide, "זה המקום שבו האישיות שלך מובילה. ספרי מקרה קצר בלי פרטים מזהים, או רגע שבו הבנת שההקשבה שלך למטופלים משנה את הדרך שבה את עובדת. צחוק טבעי כאן יעזור לקהל לנשום ולהתקרב.", [urls.shared]);
  }

  // 5. Five phases overview
  {
    theme = monochromeTheme(baseTheme, 5);
    const slide = presentation.slides.add();
    slide.background.fill = theme.bg;
    addTitle(slide, "חמשת האלמנטים ברפואה הסינית", theme, "מודל מסורתי שמתאר תנועה, קשרים ומחזוריות");
    const els = [
      { title: "עץ", detail: "אביב\nצמיחה", color: theme.green },
      { title: "אש", detail: "קיץ\nחום", color: theme.accent },
      { title: "אדמה", detail: "מרכז\nהזנה", color: theme.gold },
      { title: "מתכת", detail: "סתיו\nסדר", color: theme.accent },
      { title: "מים", detail: "חורף\nשימור", color: theme.teal },
    ];
    els.forEach((el, i) => {
      const x = 70 + i * 240;
      addCircleLabel(slide, theme, x, 215, 180, el.color, el.title, el.detail);
    });
    addText(slide, "במסורת הסינית כל אלמנט קשור גם למערכות גוף, רגשות, עונות ואיכויות תנועה. הערך של המודל נמצא בקשרים בין האלמנטים, ולא בתווית נפרדת לכל אחד.", { left: 150, top: 450, width: 980, height: 125 }, {
      fontSize: 25, color: theme.ink, alignment: "center", lineSpacing: 1.08,
    });
    addText(slide, "האלמנטים מוצגים כאן כמושגים מסורתיים ולא כקטגוריות של הרפואה המודרנית", { left: 170, top: 600, width: 940, height: 34 }, {
      fontSize: 14, color: theme.muted, alignment: "center",
    });
    addFooter(slide, theme, 5);
    notes(slide, "אפשר להציג את חמשת האלמנטים כמו חמש איכויות שחיות בכולנו. הדגישי שאדם אינו רק ״אלמנט אחד״. המסורת מתבוננת בתנועה בין האיכויות ובאיזון ביניהן.", [urls.nccih, urls.five]);
  }

  // 6. Generating cycle
  {
    theme = monochromeTheme(baseTheme, 6);
    const slide = presentation.slides.add();
    slide.background.fill = theme.bg;
    addTitle(slide, "מעגל ההזנה", theme, "כל אלמנט מזין את הבא אחריו במחזור מתמשך");
    const pos = fiveNodePositions();
    const nodes = {
      wood: addCircleLabel(slide, theme, pos.wood.x, pos.wood.y, 128, theme.green, "עץ", "מים מזינים"),
      fire: addCircleLabel(slide, theme, pos.fire.x, pos.fire.y, 128, theme.accent, "אש", "עץ מזין"),
      earth: addCircleLabel(slide, theme, pos.earth.x, pos.earth.y, 128, theme.gold, "אדמה", "אש יוצרת"),
      metal: addCircleLabel(slide, theme, pos.metal.x, pos.metal.y, 128, theme.accent, "מתכת", "אדמה נושאת"),
      water: addCircleLabel(slide, theme, pos.water.x, pos.water.y, 128, theme.teal, "מים", "מתכת אוספת"),
    };
    addCycleConnectors(slide, nodes, ["wood", "fire", "earth", "metal", "water"], theme.accent, "straight");
    addText(slide, "הזנה אינה רק נתינה. כל אלמנט גם מקבל מן הקודם וגם מכין את הקרקע לבא אחריו.", { left: 430, top: 360, width: 420, height: 110 }, {
      fontSize: 24, bold: true, color: theme.ink, alignment: "center", lineSpacing: 1.02,
    });
    addFooter(slide, theme, 6);
    notes(slide, "הסבירי את המעגל דרך דימויים פשוטים: מים מצמיחים עץ, עץ מזין אש, אש משאירה אפר, אדמה נושאת מתכת, ומתכת קשורה במסורת לאיסוף מים. הציגי זאת כמטפורה מסורתית של המשכיות.", [urls.five]);
  }

  // 7. Controlling cycle
  {
    theme = monochromeTheme(baseTheme, 7);
    const slide = presentation.slides.add();
    slide.background.fill = theme.bg;
    addTitle(slide, "מעגל הבקרה", theme, "איזון במסורת כולל גם ריסון, גבול והתאמה");
    const pos = fiveNodePositions();
    const nodes = {
      wood: addCircleLabel(slide, theme, pos.wood.x, pos.wood.y, 128, theme.green, "עץ", "חותך באדמה"),
      fire: addCircleLabel(slide, theme, pos.fire.x, pos.fire.y, 128, theme.accent, "אש", "ממיסה מתכת"),
      earth: addCircleLabel(slide, theme, pos.earth.x, pos.earth.y, 128, theme.gold, "אדמה", "תוחמת מים"),
      metal: addCircleLabel(slide, theme, pos.metal.x, pos.metal.y, 128, theme.accent, "מתכת", "חותכת עץ"),
      water: addCircleLabel(slide, theme, pos.water.x, pos.water.y, 128, theme.teal, "מים", "מרסנים אש"),
    };
    addCycleConnectors(slide, nodes, ["wood", "earth", "water", "fire", "metal"], theme.plum, "straight");
    addShape(slide, "ellipse", { left: 410, top: 330, width: 460, height: 180 }, theme.bg, theme.line, 1);
    addText(slide, "בלי הזנה אין צמיחה. בלי בקרה אין גבול. שני המעגלים יחד מתארים מערכת שמבקשת להישאר בתנועה מאוזנת.", { left: 420, top: 352, width: 440, height: 128 }, {
      fontSize: 24, bold: true, color: theme.ink, alignment: "center", lineSpacing: 1.04,
    });
    addFooter(slide, theme, 7);
    notes(slide, "המחישי דרך החיים: מים מקררים אש, אש ממיסה מתכת, מתכת חותכת עץ, עץ חודר באדמה, ואדמה תוחמת מים. השפה היא סמלית ומסורתית. הרעיון המרכזי הוא שגבול בריא תומך באיזון.", [urls.five]);
  }

  // 8. Closing
  {
    theme = monochromeTheme(baseTheme, 8);
    const slide = presentation.slides.add();
    slide.background.fill = theme.accent;
    addText(slide, "״אני לא באה ללמד רק את מה שלמדתי.\nאני באה ללמד את מה שהידיים, המטופלים והניסיון לימדו אותי.״", { left: 155, top: 150, width: 970, height: 240 }, {
      fontSize: 38, bold: true, color: "#FFFFFF", alignment: "center", lineSpacing: 1.12,
    });
    addShape(slide, "line", { left: 450, top: 430, width: 380, height: 0 }, "none", theme.line, 3);
    addText(slide, "שאלה לפתיחה", { left: 430, top: 470, width: 420, height: 45 }, {
      fontSize: 18, bold: true, color: "#FFFFFF", alignment: "center",
    });
    addText(slide, "למה הגוף מבקש שנקשיב היום?", { left: 270, top: 525, width: 740, height: 70 }, {
      fontSize: 32, color: "#FFFFFF", alignment: "center",
    });
    notes(slide, "סיימי בשקט קטן לפני השאלה. תני לקהל לענות לעצמו, ואז הזמיני שיתוף קצר. זו נקודת מעבר טובה לתרגול או להדגמה.", [urls.shared]);
  }

  return presentation;
}

async function finalizeDeck(theme, filename) {
  const presentation = await buildDeck(theme);
  const candidatePath = path.join(buildDir, `${theme.key}-candidate.pptx`);
  const finalPath = path.join(outputDir, filename);
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
  // Transfer only authored color values onto the existing native deck. Preserve
  // the verified Hebrew paragraph direction, cover, notes, and layout verbatim.
  const preservedPath = path.join(buildDir, `${theme.key}-monochrome-candidate.pptx`);
  execFileSync(RUNTIME_PYTHON, [path.join(buildDir, 'preserve_native_colors.py'),
    path.join(outputDir, `kinesiology-practical-${theme.key}-hebrew-rtl.pptx`), candidatePath, preservedPath]);
  const requirements = {
    explicitTotalSlideCount: 8,
    requiredNativeTableOwnerSlides: [],
    requiredNativeChartOwnerSlides: [],
  };
  const result = await finalizePresentation({
    ...requirements,
    workspaceDir,
    candidatePath: preservedPath,
    finalPath,
    pythonExecutable: RUNTIME_PYTHON,
    integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
    layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
    layoutArgs: [
      "--expected-slide-size-emu", "12192000,6858000",
      "--validate-bullet-geometry",
      "--validate-heading-fit",
    ],
    requiredNativeTableOwnerSlides: [],
    fontPolicy: { basis: "design", families: [FONT] },
    verifyArtifactToolImport: true,
    receiptPath: path.join(buildDir, `${path.basename(finalPath)}.validation.json`),
  });
  return { finalPath, result };
}

const outputs = [];
outputs.push(await finalizeDeck(themes.nature, "kinesiology-practical-nature-single-color.pptx"));
outputs.push(await finalizeDeck(themes.modern, "kinesiology-practical-modern-single-color.pptx"));
console.log(JSON.stringify(outputs.map(({ finalPath }) => finalPath), null, 2));
