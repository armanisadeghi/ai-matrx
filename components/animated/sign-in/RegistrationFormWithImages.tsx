// @ts-ignore - Module paths may have changed
import {FeaturedTestimonials} from "@/components/animated/login/FeaturedTestimonials";
import {cn} from "@/lib/utils";
// @ts-ignore - Module paths may have changed
import {GridLineHorizontal, GridLineVertical} from "@/components/animated/login/GridLines";
// @ts-ignore - Module paths may have changed
import AuthSignInForm from "@/components/animated/login/AuthSignIn";

function RegistrationFormWithImages() {
    return (
        <div className="w-full min-h-dvh grid grid-cols-1 md:grid-cols-2">
            <AuthSignInForm/>
            <div
                className="relative w-full z-20 hidden md:flex border-l border-neutral-100 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900 items-center justify-center">
                <div className="max-w-sm mx-auto">
                    <FeaturedTestimonials/>
                    <p
                        className={cn(
                            "font-semibold text-xl text-center text-neutral-600 dark:text-neutral-400"
                        )}
                    >
                        People love us
                    </p>
                    <p
                        className={cn(
                            "font-normal text-base text-center text-neutral-500 dark:text-neutral-400 mt-8"
                        )}
                    >
                        AI Matrx is loved by thousands of people across the world, be part
                        of the community and join us.
                    </p>
                </div>

                <GridLineHorizontal
                    className="top-4  left-1/2 -translate-x-1/2"
                    offset="-10px"
                />
                <GridLineHorizontal
                    className="bottom-4 top-auto  left-1/2 -translate-x-1/2"
                    offset="-10px"
                />
                <GridLineVertical
                    className="left-10  top-1/2 -translate-y-1/2"
                    offset="-10px"
                />
                <GridLineVertical
                    className="right-10 left-auto top-1/2 -translate-y-1/2"
                    offset="-10px"
                />
                {/* <GridLineVertical className="left-80 transform" /> */}
            </div>
        </div>
    );
}

export default RegistrationFormWithImages;
