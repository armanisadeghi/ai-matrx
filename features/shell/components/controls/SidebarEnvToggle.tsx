"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Server } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  clearServiceOverrides,
  checkServerHealth,
  selectActiveServer,
  selectActiveServerHealth,
  selectApiServiceTargets,
  selectLoopbackTargetsAllowed,
  setServiceOverride,
  switchServer,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  API_SERVICE_LABELS,
  type ApiService,
  type ServiceEnvironment,
} from "@/lib/api/service-routing";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const HEALTHY_CHECK_INTERVAL_MS = 60_000;
const UNHEALTHY_CHECK_INTERVAL_MS = 15_000;

export default function SidebarEnvToggle() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const loopbackAllowed = useAppSelector(selectLoopbackTargetsAllowed);
  const activeServer = useAppSelector(selectActiveServer);
  const activeHealth = useAppSelector(selectActiveServerHealth);
  const serviceTargets = useAppSelector(selectApiServiceTargets);
  const healthStatusRef = useRef(activeHealth.status);

  useEffect(() => {
    healthStatusRef.current = activeHealth.status;
  }, [activeHealth.status]);

  const isLocalhost = activeServer === "localhost";
  const aidreamTarget = serviceTargets.find(
    (target) => target.service === "aidream",
  );
  const isAidreamLocalhost = aidreamTarget?.environment === "localhost";
  const overrideCount = serviceTargets.filter(
    (target) => target.override !== null,
  ).length;

  useEffect(() => {
    if (!isAdmin || !isAidreamLocalhost) return;

    const intervalMs =
      healthStatusRef.current === "unhealthy"
        ? UNHEALTHY_CHECK_INTERVAL_MS
        : HEALTHY_CHECK_INTERVAL_MS;
    const timeoutId = window.setTimeout(() => {
      dispatch(checkServerHealth({ env: "localhost", force: true }));
    }, intervalMs);

    return () => window.clearTimeout(timeoutId);
  }, [activeHealth.lastCheckedAt, dispatch, isAdmin, isAidreamLocalhost]);

  if (!isAdmin || !loopbackAllowed) return null;

  const isLocalhostUnhealthy =
    isAidreamLocalhost && activeHealth.status === "unhealthy";
  const localhostColor = isLocalhostUnhealthy ? "#f97316" : "#facc15";

  const switchAll = (environment: ServiceEnvironment) => {
    dispatch(clearServiceOverrides());
    dispatch(switchServer({ env: environment }));
  };

  const handleToggle = () => {
    switchAll(isLocalhost ? "production" : "localhost");
  };

  const setOverride = (service: ApiService, value: string) => {
    const environment =
      value === "follow" ? null : (value as ServiceEnvironment);
    dispatch(
      setServiceOverride({
        service,
        environment,
      }),
    );
    if (service === "aidream") {
      dispatch(
        checkServerHealth({
          env: environment ?? activeServer,
          force: true,
        }),
      );
    }
  };

  const globalEnvironment: ServiceEnvironment = isLocalhost
    ? "localhost"
    : "production";
  const label = isLocalhost ? "Localhost" : "Production";

  return (
    <div className="shell-env-switch">
      <button
        type="button"
        onClick={handleToggle}
        className="shell-nav-item shell-tactile shell-env-primary"
        style={isLocalhost ? { color: localhostColor } : undefined}
        aria-pressed={isLocalhost}
        aria-label={`Switch all API services to ${isLocalhost ? "production" : "localhost"}`}
        title={`Using ${label} for all unpinned services. Click to switch every service.`}
      >
        <span
          className="shell-nav-icon"
          style={isLocalhost ? { color: localhostColor } : undefined}
        >
          <Server size={18} strokeWidth={1.75} />
        </span>
        <span className="shell-nav-label">
          {label}
          {overrideCount > 0 ? ` · ${overrideCount}` : ""}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shell-env-details"
            aria-label="Configure API services individually"
            title="Configure API services individually"
          >
            <ChevronDown size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            All API services
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={globalEnvironment}
            onValueChange={(value) =>
              switchAll(value as ServiceEnvironment)
            }
          >
            <DropdownMenuRadioItem value="production">
              Production
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="localhost">
              Localhost
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Per-service exceptions
          </DropdownMenuLabel>
          {serviceTargets.map((target) => (
            <DropdownMenuSub key={target.service}>
              <DropdownMenuSubTrigger className="gap-2">
                <span>{API_SERVICE_LABELS[target.service]}</span>
                <span className="ml-auto mr-1 text-[10px] uppercase text-muted-foreground">
                  {target.environment}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80">
                <DropdownMenuLabel className="truncate font-mono text-[10px] font-normal text-muted-foreground">
                  {target.url ?? "Not configured"}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={target.override ?? "follow"}
                  onValueChange={(value) =>
                    setOverride(target.service, value)
                  }
                >
                  <DropdownMenuRadioItem value="follow">
                    Follow all ({globalEnvironment})
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="production">
                    Production only
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="localhost">
                    Localhost only
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
