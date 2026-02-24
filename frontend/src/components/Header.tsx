import { Moon, Sun, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ITSupportNavbar } from './ITSupportNavbar';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSelectIssue: (query: string) => void;
}

export function Header({ theme, onToggleTheme, onSelectIssue }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-50 flex items-center px-4 md:px-6 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-3 shrink-0">
        <img
          src="/RelianceLogo.png"
          alt="Reliance Logo"
          className="h-8 w-auto"
        />
        <span className="font-semibold text-foreground hidden sm:block">GetIT GenAI</span>
      </div>

      {/* Navbar - centered */}
      <div className="flex-1 flex justify-center overflow-x-auto scrollbar-hide">
        <ITSupportNavbar onSelectIssue={onSelectIssue} />
      </div>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleTheme}
        className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
      >
        {theme === 'light' ? (
          <Moon className="w-4 h-4" />
        ) : (
          <Sun className="w-4 h-4" />
        )}
      </Button>
    </header>
  );
}
