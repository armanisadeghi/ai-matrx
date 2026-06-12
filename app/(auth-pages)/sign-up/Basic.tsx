import { login, signup } from '../login/actions'

export default function LoginPage() {
  // Wrap login/signup to match formAction signature (FormData only)
  const handleLogin = async (formData: FormData) => {
    await login('', formData);
  };
  
  const handleSignup = async (formData: FormData) => {
    await signup('', formData);
  };

  return (
    <div className="flex justify-center items-center min-h-dvh">
      <form className="flex flex-col gap-4 bg-background p-6 rounded-lg text-foreground w-full max-w-md shadow-md dark:shadow-gray-800">
        <h2 className="text-xl font-bold mb-2">AI MATRX ACCOUNT</h2>
        <label htmlFor="email" className="bg-background text-foreground text-sm font-medium">Email:</label>
        <input id="email" name="email" type="email" required className="bg-background text-foreground border border-border rounded-md p-2" />
        <label htmlFor="password" className="bg-background text-foreground text-sm font-medium">Password:</label>
        <input id="password" name="password" type="password" required className="bg-background text-foreground border border-border rounded-md p-2" />
        <button formAction={handleLogin} className="bg-background text-foreground border border-border rounded-md p-2 mt-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Log in</button>
        <button formAction={handleSignup} className="bg-background text-foreground border border-border rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Sign up</button>
      </form>
    </div>
  )
}
