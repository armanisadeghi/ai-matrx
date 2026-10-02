# Arman's notes


1. We need to make sure that our api system fully handles the usage, latency, etc. (We get it but our ui is igonreing it for now)
    - The API sends back all of the information regarding the usage and we need to get it and depending on the scenario, we need to show it somewhere in the ui, either completely or partially. It's important that we have selectors for it.
2. We need to wire the api system to ensure that for debugging, it has all of the following:
    - Recording all failures and issues to a database.
    - For admin users, making it easy to get the state, all of the stream chunks and all of that via an admin modal. (System is all set up but has to be fed) - the key with the admin system is to ensure it has ZERO footprint if it's not an admin user but when it's an admin and they turn the feature on, that's when we do this stuff.
    - Needs to incorporate all debugging from all various places including... prompt_apps have a good logging system, original /chat/ has a good admin debug system, etc. Take the best of the best for all.
3. Ideally, if we can do it without significant overhead, I'd like to have selectors that are highly specific to specigic events and even specific identifiers for the internal part of the events so we can have specialized components for things that are pre-made for specific and very unique things.