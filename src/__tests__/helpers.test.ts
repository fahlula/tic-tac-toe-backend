import {
  isValidIndex,
  isValidName,
  sanitizeName,
  sameName,
  nextTurn,
} from "../utils/helpers";

describe("isValidIndex", () => {
  it("aceita 0..8", () => {
    for (let i = 0; i <= 8; i++) expect(isValidIndex(i)).toBe(true);
  });
  it("rejeita fora do range e não-inteiros", () => {
    expect(isValidIndex(-1)).toBe(false);
    expect(isValidIndex(9)).toBe(false);
    expect(isValidIndex(2.5)).toBe(false);
    expect(isValidIndex("3" as any)).toBe(false);
  });
});

describe("isValidName + sanitizeName", () => {
  it("aceita letras (inclui acentos), números, espaço, _ e -", () => {
    const ok = ["Fabiana", "João Silva", "Ana_Maria-2", "Árvores 2025"];
    ok.forEach((n) => {
      const s = sanitizeName(n);
      expect(isValidName(s)).toBe(true);
    });
  });

  it("rejeita vazio, muito longo e caracteres estranhos", () => {
    expect(isValidName("")).toBe(false);
    expect(isValidName(" ".repeat(5))).toBe(false);
    expect(isValidName("A".repeat(31))).toBe(false);
    expect(isValidName("<script>")).toBe(false);
    expect(isValidName("Fabiana@#")).toBe(false);
  });

  it("sanitizeName: trim + colapsa espaços + corta em 30 chars", () => {
    expect(sanitizeName("  Ana   Maria  ")).toBe("Ana Maria");
    const big = "A".repeat(100);
    expect(sanitizeName(big).length).toBe(30);
  });
});

describe("sameName", () => {
  it("ignora caixa e acentos", () => {
    expect(sameName("João", "joao")).toBe(true);
    expect(sameName("FÁBIO", "fabio")).toBe(true);
    expect(sameName(" Ana  Maria ", "ana maria")).toBe(true);
  });
  it("diferentes quando realmente diferentes", () => {
    expect(sameName("Ana", "Bia")).toBe(false);
    expect(sameName("Ana", "")).toBe(false);
  });
});

describe("nextTurn", () => {
  it("alterna corretamente", () => {
    expect(nextTurn("X")).toBe("O");
    expect(nextTurn("O")).toBe("X");
  });
});
