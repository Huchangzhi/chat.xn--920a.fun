import { cn } from "@/lib/utils";
import { version } from "@/package.json";

const Footer = ({ classname }: { classname?: string }) => {
  return (
    <footer
      className={cn(
        classname,
        "text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4",
      )}
    >
      基于v{version} ·{" "}
      <a
        href="https://github.com/Jazee6/cloudflare-ai-web"
        target="_blank"
        rel="noopener"
      >
        cloudflare-ai-web修改
      </a>
    </footer>
  );
};

export default Footer;
