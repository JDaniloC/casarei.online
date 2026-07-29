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
});
