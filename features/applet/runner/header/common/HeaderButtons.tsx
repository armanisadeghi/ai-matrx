import { useAppDispatch } from "@/lib/redux/hooks";
import Link from "next/link";
import { HeaderExtraButtonsConfig } from "@/types/customAppTypes";
import { useToast } from "@/components/ui/use-toast";

type ToastFunction = ReturnType<typeof useToast>["toast"];

// Export the handler functions for use in ButtonMenu
export const renderChat = (button: HeaderExtraButtonsConfig, toast: ToastFunction) => {
    console.log("Rendering chat interface");
    // In a real app, this might open a chat window or component
    toast({
        title: "Chat interface rendered!",
        description: JSON.stringify(button, null, 2),
        variant: "success",
    });
};

export const changeApplet = (button: HeaderExtraButtonsConfig, toast: ToastFunction) => {
    console.log("Changing applet");
    // In a real app, this might switch to a different applet or module
    toast({
        title: "Applet changed!",
        description: JSON.stringify(button, null, 2),
        variant: "success",
    });
};

export const renderModal = (button: HeaderExtraButtonsConfig, toast: ToastFunction) => {
    console.log("Rendering modal");
    // In a real app, this might open a modal or component
    toast({
        title: "Modal rendered!",
        description: JSON.stringify(button, null, 2),
        variant: "success",
    });
};

export const renderSampleApplet = (button: HeaderExtraButtonsConfig, toast: ToastFunction) => {
    console.log("Rendering sample applet");
    // In a real app, this might open a modal or component
    toast({
        title: "Sample applet rendered!",
        description: JSON.stringify(button, null, 2),
        variant: "success",
    });
};

export const HeaderExtraButtons = ({ buttons }: { buttons: HeaderExtraButtonsConfig[] }) => {
    const dispatch = useAppDispatch();
    const { toast } = useToast();

    // Handle knownMethod executions
    const handleKnownMethod = (button: HeaderExtraButtonsConfig) => {
        if (!button.knownMethod || button.knownMethod === "none") return;
        switch (button.knownMethod) {
            case "renderChat":
                renderChat(button, toast);
                break;
            case "changeApplet":
                changeApplet(button, toast);
                break;
            case "renderModal":
                renderModal(button, toast);
                break;
            case "renderSampleApplet":
                renderSampleApplet(button, toast);
                break;
            default:
                console.warn(`Unknown knownMethod: ${button.knownMethod}`);
        }
    };

    return (
        <div className="flex items-center gap-2">
            {buttons.map((button) => {
                const buttonStyles =
                    "text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full px-2 py-2 text-gray-800 dark:text-gray-200 flex items-center gap-2";

                switch (button.actionType) {
                    case "button":
                        return (
                            <button
                                key={button.label}
                                className={buttonStyles}
                                onClick={() => {
                                    if (button.onClick) button.onClick();
                                    handleKnownMethod(button);
                                }}
                            >
                                {button.icon}
                                {button.label}
                            </button>
                        );

                    case "link":
                        if (!button.route) {
                            console.warn(`Link button "${button.label}" missing route`);
                            return null;
                        }
                        return (
                            <Link key={button.label} href={button.route} className={buttonStyles} onClick={() => handleKnownMethod(button)}>
                                {button.icon}
                                {button.label}
                            </Link>
                        );

                    case "redux":
                        const reduxAction = button.reduxAction;
                        if (!reduxAction) {
                            console.warn(`Redux button "${button.label}" missing reduxAction`);
                            return null;
                        }
                        return (
                            <button
                                key={button.label}
                                className={buttonStyles}
                                onClick={() => {
                                    dispatch({ type: reduxAction, payload: {} });
                                    handleKnownMethod(button);
                                }}
                            >
                                {button.icon}
                                {button.label}
                            </button>
                        );

                    case "none":
                    default:
                        return (
                            <div key={button.label} className={buttonStyles}>
                                {button.icon}
                                {button.label}
                            </div>
                        );
                }
            })}
        </div>
    );
};

export default HeaderExtraButtons;
