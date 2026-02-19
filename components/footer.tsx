import { cn } from "@/lib/utils";

const Footer = ({ classname }: { classname?: string }) => {
  return (
    <footer
      className={cn(
        classname,
        "text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4",
      )}
    >
      <a
        href="https://github.com/Jazee6/cloudflare-ai-web"
        target="_blank"
        rel="noopener"
      >
        OpenAI Chat Web
      </a>
    </footer>
  );
};

export default Footer;
