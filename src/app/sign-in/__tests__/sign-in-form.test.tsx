/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { SignInForm } from "../sign-in-form";
import en from "../../../../messages/en.json";

/**
 * FR-31 / tiket 106: the visitor's end of the demo door.
 *
 * The three mocks below are the client-side plumbing the sign-in screen needs
 * to render at all (router, query string, better-auth client). None of them is
 * the thing under test: every assertion here is about the demo block's own
 * markup, so a mock that behaves more loosely than the real thing cannot make
 * these pass.
 *
 * `useTranslations` deliberately reads the REAL messages/en.json instead of
 * echoing the key back. That makes the button label a claim about shipped copy:
 * delete `auth.signIn.demoSubmit` from the message file and this goes red,
 * which a key-echoing stub would happily survive.
 */
let query = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => query,
}));

jest.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    const pesan = ns
      .split(".")
      .reduce<
        Record<string, unknown>
      >((acc, bagian) => acc[bagian] as Record<string, unknown>, en as unknown as Record<string, unknown>);
    const nilai = pesan[key];
    if (typeof nilai !== "string") {
      throw new Error(`kunci i18n hilang: ${ns}.${key}`);
    }
    return nilai;
  },
}));

jest.mock("@/shared/lib/auth/client", () => ({
  signIn: { email: jest.fn() },
}));

const salinan = en.auth.signIn;

beforeEach(() => {
  query = new URLSearchParams();
});

describe("sign-in screen, demo entry", () => {
  it("offers the entry, and points it at the door, when the server says it exists", () => {
    render(<SignInForm demoEnabled />);

    const tombol = screen.getByRole("button", { name: salinan.demoSubmit });
    const form = tombol.closest("form");
    expect(form).not.toBeNull();
    // A plain POST, not a fetch: the entry then works before this component has
    // hydrated, which is exactly when an impatient visitor clicks
    // (NEXT-GOTCHAS 13). `getAttribute`, not `form.action`, because jsdom
    // resolves the property against the document origin.
    expect(form!.getAttribute("method")).toBe("post");
    expect(form!.getAttribute("action")).toBe("/api/demo");
    // Its own form. Forms cannot nest, so a demo button that ended up inside
    // the credential form would submit the email and password fields instead.
    expect(form!.querySelector("input[type='email']")).toBeNull();

    expect(screen.getByText(salinan.demoHint)).toBeInTheDocument();
  });

  it("shows no entry at all when the server says the demo is unconfigured", () => {
    render(<SignInForm demoEnabled={false} />);

    expect(
      screen.queryByRole("button", { name: salinan.demoSubmit }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(salinan.demoHint)).not.toBeInTheDocument();
    // Control: the screen still rendered, so the absence above is the gate
    // doing its job and not a component that failed to mount.
    expect(
      screen.getByRole("button", { name: salinan.submit }),
    ).toBeInTheDocument();
  });

  it("explains itself when the door sent the visitor back", () => {
    query = new URLSearchParams("demo=unavailable");
    render(<SignInForm demoEnabled />);

    expect(screen.getByText(salinan.errorGeneric)).toBeInTheDocument();
  });

  it("says nothing about a failure on a plain visit", () => {
    render(<SignInForm demoEnabled />);

    expect(screen.queryByText(salinan.errorGeneric)).not.toBeInTheDocument();
  });
});
