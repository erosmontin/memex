"use client";

import { useState, useEffect } from "react";
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";
import { useRouter } from "next/navigation";



export default function LoginPage() {
  const router = useRouter();
  
  // If token is stored, redirect to dashboard.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.push("/dashboard");
    }
  }, [router]);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [isNewPasswordRequired, setIsNewPasswordRequired] = useState(false);
  const [cognitoUser, setCognitoUser] = useState<CognitoUser | null>(null);

  // States for forgot password flow
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotCodeSent, setForgotCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const userPool = new CognitoUserPool({
      UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
    });

    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (result) => {
        const token = result.getIdToken().getJwtToken();
        localStorage.setItem("token", token);
        console.log("Token set in localStorage:", token);
        router.push("/dashboard");
      },
      onFailure: (err) => {
        setError(err.message || "Login failed");
      },
      newPasswordRequired: () => {
        setIsNewPasswordRequired(true);
        setCognitoUser(user);
        setError("Please set a new password.");
      },
    });
  };

  const handleNewPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!cognitoUser) {
      setError("No user session found.");
      return;
    }

    cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (result) => {
        const token = result.getIdToken().getJwtToken();
        localStorage.setItem("token", token);
        console.log("New password set, token:", token);
        router.push("/dashboard");
      },
      onFailure: (err) => {
        setError(err.message || "Failed to set new password");
      },
    });
  };

  // Forgot password: send verification code
  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Please enter your email.");
      return;
    }

    const userPool = new CognitoUserPool({
      UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
    });
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.forgotPassword({
      onSuccess: () => {
        // Not typically called in this flow.
      },
      onFailure: (err) => {
        setError(err.message || "Failed to send verification code");
      },
      inputVerificationCode: () => {
        setForgotCodeSent(true);
        setError("Verification code sent to your email.");
      },
    });
  };

  // Forgot password: confirm new password using verification code
  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Please enter your email.");
      return;
    }
    const userPool = new CognitoUserPool({
      UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
    });
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmPassword(verificationCode, resetNewPassword, {
      onSuccess: () => {
        setError("Password reset successfully! Please log in with your new password.");
        // Reset forgot password state & switch back to login view
        setIsForgotPassword(false);
        setForgotCodeSent(false);
        setVerificationCode("");
        setResetNewPassword("");
      },
      onFailure: (err) => {
        setError(err.message || "Failed to reset password");
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        {!isForgotPassword && !isNewPasswordRequired && (
          <>
            <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              {error && <p className="text-red-500 mb-4">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                Login
              </button>
              <p className="mt-4 text-center">
                <button
                  type="button"
                  className="text-blue-500 underline"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError("");
                  }}
                >
                  Forgot your password?
                </button>
              </p>
            </form>
          </>
        )}

        {isNewPasswordRequired && (
          <>
            <h1 className="text-2xl font-bold mb-6 text-center">
              Set New Password
            </h1>
            <form onSubmit={handleNewPasswordSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              {error && <p className="text-red-500 mb-4">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                Submit New Password
              </button>
            </form>
          </>
        )}

        {isForgotPassword && !forgotCodeSent && (
          <>
            <h1 className="text-2xl font-bold mb-6 text-center">
              Reset Password
            </h1>
            <form onSubmit={handleForgotPassword}>
              <div className="mb-4">
                <label className="block text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              {error && <p className="text-red-500 mb-4">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                Send Verification Code
              </button>
              <p className="mt-4 text-center">
                <button
                  type="button"
                  className="text-blue-500 underline"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setError("");
                  }}
                >
                  Back to Login
                </button>
              </p>
            </form>
          </>
        )}

        {isForgotPassword && forgotCodeSent && (
          <>
            <h1 className="text-2xl font-bold mb-6 text-center">
              Enter Verification Code
            </h1>
            <form onSubmit={handleResetPassword}>
              <div className="mb-4">
                <label className="block text-gray-700">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700">
                  New Password
                </label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              {error && <p className="text-red-500 mb-4">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                Reset Password
              </button>
              <p className="mt-4 text-center">
                <button
                  type="button"
                  className="text-blue-500 underline"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setForgotCodeSent(false);
                    setError("");
                  }}
                >
                  Back to Login
                </button>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}