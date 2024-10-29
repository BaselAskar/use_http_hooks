/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import React, {
  useState,
  useCallback,
  createContext,
  useContext,
  useEffect,
} from "react";

/* #region Constants */
const CONTENT_TYPE = "Content-Type";
const APPLICATION_JSON = "application/json";

/* #endregion */

/* #region interface */
export interface HttpBuilder {
  baseUrl: string;
  defaultApplyError: (error: unknown) => void;
  onLogout?: () => void;
  tokenServices?: {
    getToken: () => string | null;
    refreshToken: (response: Response) => void;
    setToken: (jwt: string) => void;
    removeToken: () => void;
  };
}

export interface RequestConfig<TData> {
  url: string;
  method?: "get" | "post" | "put" | "delete";
  header?: { [key: string]: string };
  auth?: boolean;
  state?: "one" | "multi";
  preventRefreshToken?: boolean;
  onSuccess?: (response: HttpResponse<TData>) => void;
  applyError?: (error: any) => void;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

export interface RequestParams {
  query?: object;
  pathParams?: string[];
  body?: object | Array<unknown> | null;
}

interface AuthType<TUser> {
  user: TUser | null;
  login: (userInfo: TUser) => void;
  // logout: () => void;
  updateUser: (userInfo: Partial<TUser>) => void;
}

/* #endregion */

/* #region default params */
const defaultCreateHttp: HttpBuilder = {
  baseUrl: "",
  defaultApplyError: (_: any) => {},
};

const defaultRequestConfig: RequestConfig<any> = {
  url: "",
  method: "get",
  header: {},
  auth: true,
  state: "one",
  preventRefreshToken: false,
};

const defaultRequestParams: RequestParams = {
  query: {},
  pathParams: [],
  body: null,
};

/* #endregion */
export function httpProviderBuilder<
  TK extends string = "token",
  TUser extends { [key in TK]: string } = { [key in TK]: string }
>(createHttpParams: HttpBuilder = defaultCreateHttp) {
  createHttpParams = { ...defaultRequestConfig, ...createHttpParams };

  const {
    defaultApplyError,
    tokenServices: ts,
    onLogout,
    baseUrl,
  } = createHttpParams;

  // Create authentication context
  // const AuthContext = createContext<AuthType<TUser>>({
  //   user: null,
  //   login(_) {},
  //   logout() {},
  //   updateUser(_) {},
  // });

  // const AuthProvider = function ({ children }: React.PropsWithChildren) {
  //   const [user, setUser] = useState<TUser | null>(null);

  //   function login(userInfo: TUser) {
  //     ts?.setToken(userInfo[]);

  //     setUser(userInfo);
  //   }

  //   function logout() {
  //     // ts?.removeToken();
  //     setUser(null);
  //     onLogout?.();
  //   }

  //   function updateUser(userInfo: Partial<TUser>) {
  //     setUser((state) => {
  //       if (!state) return null;

  //       Object.entries(userInfo).forEach(([key, value]) => {
  //         if (value !== undefined) {
  //           state[key as keyof TUser] = value;
  //         }
  //       });

  //       return { ...state };
  //     });
  //   }

  //   return React.createElement(AuthContext.Provider, {
  //     value: { user, login, logout, updateUser },
  //     children,
  //   });
  // };

  // const useAuthStore = () => useContext<AuthType<TUser>>(AuthContext);

  const useHttp = <TResult = any>(
    reqConfig: RequestConfig<TResult>,
    dependencies: any[] = []
  ) => {
    if (!reqConfig.applyError) reqConfig.applyError = defaultApplyError;
    reqConfig = { ...defaultRequestConfig, ...reqConfig };

    const [states, setStates] = useState<{ loading: boolean; error: any }>({
      loading: false,
      error: null,
    });

    const { loading, error } = states;

    // const { logout: logoutAction } = useAuthStore();

    const request = useCallback(
      async (params: RequestParams = defaultRequestParams) => {
        if (!reqConfig.applyError) reqConfig.applyError = defaultApplyError;

        params = { ...defaultRequestParams, ...params };
        if (loading && reqConfig.state === "one") return;

        setStates({ loading: true, error: null });

        // path values
        const variablesInUrl =
          params?.pathParams && params.pathParams?.length > 0
            ? "/" + params.pathParams.join("/")
            : "";

        // query values
        let queryParams = "";

        if (params?.query && Object.entries(params.query).length > 0) {
          queryParams += "?";

          queryParams += Object.entries(params.query)
            .map(([key, value]) => {
              if (value === undefined) return "";

              if (Array.isArray(value)) {
                return value.map((v, i) => `${key}[${i}]=${v}`).join("&");
              }

              return `${key}=${value}`;
            })
            .filter((v) => v !== "")
            .join("&");
        }

        // request headers

        const reqHeader = new Headers();

        if (params?.body) {
          if (params.body instanceof FormData) {
            /* empty */
          } else {
            reqHeader.append(CONTENT_TYPE, APPLICATION_JSON);
          }
        }

        if (reqConfig.header) {
          Object.entries(reqConfig.header).forEach(([key, value]) => {
            reqHeader.append(key, value);
          });
        }

        if (reqConfig.auth && ts) {
          const jwt = ts.getToken();
          // if (!jwt) logoutAction();
          reqHeader.append("Authorization", `Bearer ${jwt}`);
        }

        let bodyBuilder: BodyInit | null | undefined;

        if (params.body) {
          if (reqHeader.get(CONTENT_TYPE) === APPLICATION_JSON) {
            bodyBuilder = JSON.stringify(params.body);
          } else if (params.body instanceof FormData) {
            bodyBuilder = params.body;
          }
        }

        try {
          const response = await fetch(
            baseUrl + reqConfig.url + variablesInUrl + queryParams,
            {
              method: reqConfig.method!.toUpperCase(),
              headers: reqHeader,
              body: bodyBuilder,
            }
          );

          // if (response.status === 401) {
          //   logoutAction();
          // }

          if (response.status >= 400) {
            throw await response.json();
          }

          if (reqConfig.auth && !reqConfig.preventRefreshToken && ts) {
            ts.refreshToken(response);
          }

          let data: any;

          try {
            data = (await response.json()) as TResult;
          } catch {
            try {
              data = (await response.text()) as TResult;
            } catch {
              data = undefined;
            }
          }

          const httpResponse: HttpResponse<TResult> = {
            data,
            ...response,
          };

          reqConfig?.onSuccess?.(httpResponse);
          setStates({ loading: false, error: null });
        } catch (err: any) {
          if (error?.message === "Failed to fetch") {
            // logoutAction();
            return;
          }
          setStates({ loading: false, error: err });
        }
      },
      [loading, ...dependencies]
    );

    useEffect(() => {
      error && reqConfig.applyError?.(error);
    }, [error]);

    return {
      request,
      loading: loading,
      error,
    };
  };

  return {
    useHttp,
    // AuthProvider,
    // useAuthStore,
  };
}
