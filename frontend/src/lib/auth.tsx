import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  username: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  signup: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USERS_KEY = 'skyly_users';
const SESSION_KEY = 'skyly_session';

function getUsers(): Record<string, string> {
  const raw = localStorage.getItem(USERS_KEY);
  const users = raw ? JSON.parse(raw) : {};
  // Ensure default admin account exists
  if (!users['admin']) {
    users['admin'] = 'admin';
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  return users;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  });

  const login = (username: string, password: string): boolean => {
    const users = getUsers();
    if (users[username] && users[username] === password) {
      const u = { username };
      setUser(u);
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      return true;
    }
    return false;
  };

  const signup = (username: string, password: string): boolean => {
    const users = getUsers();
    if (users[username]) return false; // already exists
    users[username] = password;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const u = { username };
    setUser(u);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
