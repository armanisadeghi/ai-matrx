import { Layouts } from "./types";

export const layouts: Layouts = {
    complexDashboard: {
        desktop: [
            { id: 'featured', gridArea: '1 / 1 / 3 / 4', minHeight: '250px' },
            { id: 'header1', gridArea: '1 / 4 / 2 / 7', minHeight: '120px' },
            { id: 'header2', gridArea: '2 / 4 / 3 / 7', minHeight: '120px' },
            { id: 'sidebar', gridArea: '1 / 7 / 3 / 9', minHeight: '250px' },
            { id: 'main', gridArea: '3 / 1 / 5 / 3', minHeight: '200px' },
            { id: 'quickLink1', gridArea: '3 / 3 / 4 / 5', minHeight: '100px' },
            { id: 'quickLink2', gridArea: '4 / 3 / 5 / 5', minHeight: '100px' },
            { id: 'secondary', gridArea: '3 / 5 / 5 / 7', minHeight: '200px' },
            { id: 'social', gridArea: '3 / 7 / 4 / 9', minHeight: '100px' },
            { id: 'weather', gridArea: '4 / 7 / 5 / 9', minHeight: '100px' },
            { id: 'footer1', gridArea: '5 / 1 / 6 / 5', minHeight: '150px' },
            { id: 'footer2', gridArea: '5 / 5 / 6 / 9', minHeight: '150px' },
        ],
        tablet: [
            { id: 'featured', gridArea: '1 / 1 / 3 / 7', minHeight: '200px' },
            { id: 'header1', gridArea: '1 / 7 / 2 / 13', minHeight: '100px' },
            { id: 'header2', gridArea: '2 / 7 / 3 / 13', minHeight: '100px' },
            { id: 'sidebar', gridArea: '3 / 1 / 5 / 5', minHeight: '200px' },
            { id: 'main', gridArea: '3 / 5 / 5 / 13', minHeight: '200px' },
            { id: 'quickLink1', gridArea: '5 / 1 / 6 / 7', minHeight: '100px' },
            { id: 'quickLink2', gridArea: '5 / 7 / 6 / 13', minHeight: '100px' },
            { id: 'secondary', gridArea: '6 / 1 / 8 / 7', minHeight: '200px' },
            { id: 'social', gridArea: '6 / 7 / 7 / 13', minHeight: '100px' },
            { id: 'weather', gridArea: '7 / 7 / 8 / 13', minHeight: '100px' },
            { id: 'footer1', gridArea: '8 / 1 / 9 / 7', minHeight: '100px' },
            { id: 'footer2', gridArea: '8 / 7 / 9 / 13', minHeight: '100px' },
        ],
        mobile: [
            { id: 'featured', gridArea: '1 / 1 / 3 / 13', minHeight: '200px' },
            { id: 'header1', gridArea: '3 / 1 / 4 / 13', minHeight: '80px' },
            { id: 'header2', gridArea: '4 / 1 / 5 / 13', minHeight: '80px' },
            { id: 'main', gridArea: '5 / 1 / 7 / 13', minHeight: '200px' },
            { id: 'quickLink1', gridArea: '7 / 1 / 8 / 13', minHeight: '80px' },
            { id: 'quickLink2', gridArea: '8 / 1 / 9 / 13', minHeight: '80px' },
            { id: 'secondary', gridArea: '9 / 1 / 11 / 13', minHeight: '200px' },
            { id: 'social', gridArea: '11 / 1 / 12 / 13', minHeight: '80px' },
            { id: 'weather', gridArea: '12 / 1 / 13 / 13', minHeight: '80px' },
            { id: 'sidebar', gridArea: '13 / 1 / 15 / 13', minHeight: '200px' },
            { id: 'footer1', gridArea: '15 / 1 / 16 / 13', minHeight: '80px' },
            { id: 'footer2', gridArea: '16 / 1 / 17 / 13', minHeight: '80px' },
        ],
    },
    // Add more layout configurations here
};
