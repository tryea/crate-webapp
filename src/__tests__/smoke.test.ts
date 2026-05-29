describe("Jest smoke", () => {
  it("runs and arithmetic works", () => {
    expect(1 + 1).toBe(2);
  });

  it("jsdom is available", () => {
    const div = document.createElement("div");
    div.textContent = "hello";
    expect(div.textContent).toBe("hello");
  });
});
