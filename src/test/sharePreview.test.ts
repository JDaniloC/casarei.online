import { readFileSync } from "node:fs";
import path from "node:path";

const readRepoFile = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf-8");

describe("preview de compartilhamento", () => {
  it("não referencia a og-image inexistente", () => {
    expect(readRepoFile("index.html")).not.toContain("og-image");
  });

  it("apresentacao.html não se anuncia como convite", () => {
    const html = readRepoFile("apresentacao.html").toLowerCase();

    expect(html).not.toContain("convite");
    expect(html).not.toContain("presença");
    expect(html).toContain("nosso casamento | casarei.online");
    expect(html).toContain(
      "conheça nossa história, veja as fotos e a lista de presentes."
    );
  });

  it("index.html continua sendo o convite", () => {
    const html = readRepoFile("index.html").toLowerCase();

    expect(html).toContain("convite de casamento | casarei.online");
    expect(html).toContain("confirme sua presença");
  });

  it("os dois HTMLs montam o mesmo SPA", () => {
    for (const file of ["index.html", "apresentacao.html"]) {
      const html = readRepoFile(file);

      expect(html).toContain('<div id="root"></div>');
      expect(html).toContain('src="/src/main.tsx"');
    }
  });

  it("nenhum dos dois referencia a og-image inexistente", () => {
    expect(readRepoFile("apresentacao.html")).not.toContain("og-image");
  });

  it("apresentacao.html está registrada como entrada do build", () => {
    expect(readRepoFile("vite.config.ts")).toContain("apresentacao.html");
  });
});

describe("_redirects", () => {
  const rules = readRepoFile("public/_redirects")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const indexOfRule = (from: string) =>
    rules.findIndex((rule) => rule.split(/\s+/)[0] === from);

  const targetOfRule = (from: string) =>
    rules.find((rule) => rule.split(/\s+/)[0] === from)?.split(/\s+/)[1];

  it("serve a apresentação no link geral", () => {
    expect(targetOfRule("/:slug")).toBe("/apresentacao.html");
  });

  it("mantém o convite no index.html", () => {
    expect(indexOfRule("/:slug/convite")).toBeGreaterThanOrEqual(0);
    expect(indexOfRule("/:slug/convite")).toBeLessThan(indexOfRule("/:slug"));
    expect(indexOfRule("/:slug/convite/*")).toBeLessThan(indexOfRule("/:slug"));
    expect(targetOfRule("/:slug/convite")).toBe("/index.html");
    expect(targetOfRule("/:slug/convite/*")).toBe("/index.html");
  });

  it("resolve as rotas de sistema antes do slug", () => {
    const systemRoutes = [
      "/login",
      "/register",
      "/dashboard",
      "/preview",
      "/demo",
      "/payment-success",
      "/payment-failure",
      "/payment-pending",
      // Página do QR code dos convidados e política de privacidade: se caírem depois do
      // /:slug, o link do QR e a URL de privacidade dada ao Google viram páginas de casamento.
      "/fotos/*",
      "/privacidade",
    ];

    for (const route of systemRoutes) {
      expect(indexOfRule(route)).toBeGreaterThanOrEqual(0);
      expect(indexOfRule(route)).toBeLessThan(indexOfRule("/:slug"));
      expect(targetOfRule(route)).toBe("/index.html");
    }
  });

  it("mantém o catch-all por último", () => {
    expect(indexOfRule("/*")).toBe(rules.length - 1);
  });
});
