import { redirect } from 'next/navigation';

export default function PodcastsIndexPage() {
    redirect('/administration/podcasts/shows');
}
