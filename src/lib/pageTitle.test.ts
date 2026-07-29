import { buildWeddingPageTitle } from "./pageTitle";

describe("buildWeddingPageTitle", () => {
  it("anuncia convite na visão de convidado", () => {
    expect(buildWeddingPageTitle("Carla & Ewerton", true)).toBe(
      "Carla & Ewerton | Convite de Casamento"
    );
  });

  it("não diz convite no link geral", () => {
    expect(buildWeddingPageTitle("Carla & Ewerton", false)).toBe(
      "Carla & Ewerton | Nosso Casamento"
    );
  });
});
