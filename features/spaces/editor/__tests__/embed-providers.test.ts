import { embedTarget, providerOf } from "../embed-providers";

describe("embed providers (C23 / N16)", () => {
  it.each([
    ["https://drive.google.com/file/d/1AbC_d-e/view?usp=sharing", "drive", "https://drive.google.com/file/d/1AbC_d-e/preview"],
    ["https://docs.google.com/document/d/1xyz/edit", "drive", "https://docs.google.com/document/d/1xyz/preview"],
    ["https://drive.google.com/drive/folders/0Bfold", "drive", "https://drive.google.com/embeddedfolderview?id=0Bfold#list"],
    ["https://www.figma.com/file/abc/Design", "figma", `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent("https://www.figma.com/file/abc/Design")}`],
    ["https://www.google.com/maps/place/Eiffel+Tower/@48.85,2.29,17z", "maps", "https://maps.google.com/maps?q=Eiffel%20Tower&output=embed"],
    ["https://acme.typeform.com/to/AbCd12", "typeform", "https://form.typeform.com/to/AbCd12"],
    ["https://codepen.io/team/pen/xyzAB", "codepen", "https://codepen.io/team/embed/xyzAB?default-tab=result"],
    ["https://whimsical.com/flow-ABC123", "whimsical", "https://whimsical.com/embed/flow-ABC123"],
    ["https://my-site.framer.website/", "framer", "https://my-site.framer.website/"],
    ["https://www.loom.com/share/abc123", "loom", "https://www.loom.com/embed/abc123"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ"],
    ["https://example.com/page", "embed", "https://example.com/page"],
  ])("%s -> %s", (url, provider, src) => {
    expect(providerOf(url)).toBe(provider);
    expect(embedTarget(url)).toEqual({ src, provider });
  });

  it("draws a Gist through its own script, never as a page frame", () => {
    const t = embedTarget("https://gist.github.com/octocat/6cad326836d38bd3a7ae");
    expect(t?.provider).toBe("gist");
    expect(t?.src).toBeUndefined();
    expect(t?.srcDoc).toContain('<script src="https://gist.github.com/octocat/6cad326836d38bd3a7ae.js"></script>');
  });

  it("refuses what is not a web address", () => {
    expect(embedTarget("javascript:alert(1)")).toBeNull();
    expect(embedTarget("not a url")).toBeNull();
  });
});
