import EnhancedDynamicLayout from "../../components/EnhancedDynamicLayout";
import Link from 'next/link'


export default function Page() {

    return (
        <div className="my-8">
            <Link href="/tests/app-shell-test/single-option/sample-nested/sample-nested-again">Go to Sample Nested Again</Link>

            <EnhancedDynamicLayout
                layoutType="complexDashboard"
                backgroundColor="bg-gray-900"
                gap="medium"
                padding="medium"
                rounded={true}
                animate={true}
                hoverEffect={true}
            >
                <div id="featured">Featured Content</div>
                <div id="header1">Header 1</div>
                <div id="header2">Header 2</div>
                <div id="sidebar">Sidebar</div>
                <div id="main">Main Article</div>
                <div id="quickLink1">Quick Link 1</div>
                <div id="quickLink2">Quick Link 2</div>
                <div id="secondary">Secondary Article</div>
                <div id="social">Social Media Feed</div>
                <div id="weather">Weather Widget</div>
                <div id="footer1">Footer Content 1</div>
                <div id="footer2">Footer Content 2</div>
            </EnhancedDynamicLayout>

        </div>

    );
}
