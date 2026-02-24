import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Mail, Lock, ArrowRight, Eye, EyeOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { login, register, getMe } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isRegister && !name)) {
      toast.error("Please fill in all fields", { duration: 3000 });
      return;
    }
    setIsLoading(true);
    try {
      if (isRegister) {
        await register(email, password, name);
        toast.success("Account created!", { description: `Welcome, ${name}!`, duration: 3000 });
      } else {
        await login(email, password);
        toast.success("Signed in successfully", { description: `Welcome back, ${email.split("@")[0]}!`, duration: 3000 });
      }
      await refreshUser();

      // Check role for redirection
      try {
        const userProfile = await getMe();
        if (userProfile.role === 'admin' || userProfile.role === 'superadmin') {
          navigate("/admin");
        } else {
          navigate("/chat");
        }
      } catch (e) {
        navigate("/chat");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      toast.error(message, { duration: 3000 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSO = (provider: string) => {
    toast.info(`${provider} SSO`, {
      description: `${provider} SSO integration coming soon.`,
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 md:p-6 relative overflow-hidden">
      {/* Theme Toggle */}
      <div className="fixed top-3 right-3 md:top-4 md:right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[300px] md:w-[500px] h-[300px] md:h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[250px] md:w-[400px] h-[250px] md:h-[400px] rounded-full bg-accent/5 blur-[100px]" />
      </div>
      <div className="fixed inset-0 noise pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          >
            <Logo size={64} />
          </motion.div>
        </Link>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6 md:p-8"
        >
          <div className="text-center mb-6 md:mb-8">
            <h1 className="text-xl md:text-2xl font-bold mb-2">
              {isRegister ? "Create Account" : "Welcome Back"}
            </h1>
            <p className="text-muted-foreground text-xs md:text-sm">
              {isRegister ? "Sign up for your AI support console" : "Sign in to access your AI support console"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
            {isRegister && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Full Name
                </label>
                <div className="relative">
                  <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="John Smith"
                    className="pl-11 md:pl-12"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="engineer@company.com"
                  className="pl-11 md:pl-12"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-11 md:pl-12 pr-12"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 md:w-5 md:h-5" />
                  ) : (
                    <Eye className="w-4 h-4 md:w-5 md:h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border bg-secondary accent-primary"
                />
                <span className="text-xs md:text-sm text-muted-foreground">
                  Remember me
                </span>
              </label>
              <button
                type="button"
                className="text-xs md:text-sm text-primary hover:underline"
                onClick={() => toast.info("Password Reset", { description: "Contact your IT administrator to reset your password." })}
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  {isRegister ? "Create Account" : "Sign In"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-5 md:mt-6 pt-5 md:pt-6 border-t border-border">
            <p className="text-center text-xs md:text-sm text-muted-foreground">
              {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                className="text-primary hover:underline"
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        </motion.div>

        {/* SSO Options */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 text-center"
        >
          <p className="text-xs md:text-sm text-muted-foreground mb-4">
            Enterprise SSO Available
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="glass" size="sm" className="gap-2" onClick={() => handleSSO("Google")}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
              </svg>
              Google SSO
            </Button>
            <Button variant="glass" size="sm" className="gap-2" onClick={() => handleSSO("Azure AD")}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.4 2L2 7.1l3.5 3 6-3.3V2h-.1zm1.2 0v4.8l6 3.3 3.4-3L13.6 2h-1zm-1.2 6L5 11.3v5.4L11.4 20v-6.8L5.4 10l6-3v.9l.1.1-.1-1zm1.2 0v1l6 3.3-6 3.2V20l6.6-3.3V11.3L12.6 8z" />
              </svg>
              Azure AD
            </Button>
          </div>
        </motion.div>

        {/* Back to home */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <Link
            to="/"
            className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Home
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;
