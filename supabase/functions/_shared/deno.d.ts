// Minimal Deno globals for type-checking under Node. The real runtime provides these.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};
